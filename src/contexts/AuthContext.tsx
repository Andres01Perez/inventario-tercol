import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export type AppRole = 'superadmin' | 'admin_mp' | 'admin_pp' | 'supervisor' | null;

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole;
  loading: boolean;
  roleLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  
  // Track current user ID to prevent race conditions
  const currentUserIdRef = useRef<string | null>(null);
  // Track if initial auth has been completed to prevent duplicate fetches
  const initializedRef = useRef(false);
  const queryClientRef = useRef<ReturnType<typeof useQueryClient> | null>(null);

  // Get queryClient safely (will be set when component mounts inside QueryClientProvider)
  try {
    queryClientRef.current = useQueryClient();
  } catch {
    // QueryClient not available yet, will be set later
  }

  const clearAllCaches = useCallback(() => {
    if (queryClientRef.current) {
      queryClientRef.current.clear();
    }
    // Clear role cache on logout
    sessionStorage.removeItem('cached_role');
    sessionStorage.removeItem('cached_user_id');
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    // Prevent stale updates if user changed
    if (currentUserIdRef.current !== userId) {
      return;
    }

    setRoleLoading(true);

    try {
      // Fetch profile and role in parallel for better performance
      const [profileResult, roleResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .rpc('get_user_role', { _user_id: userId })
      ]);

      // Check again if user is still the same
      if (currentUserIdRef.current !== userId) {
        return;
      }

      // Handle profile
      if (profileResult.error) {
        console.error('Error fetching profile:', profileResult.error);
      } else {
        setProfile(profileResult.data);
      }

      // Handle role
      if (roleResult.error) {
        console.error('Error fetching role:', roleResult.error);
        setRole(null);
        sessionStorage.removeItem('cached_role');
        sessionStorage.removeItem('cached_user_id');
      } else {
        // roleData can be 'superadmin' | 'admin' | 'admin_mp' | 'admin_pp' | 'supervisor' | 'operario' | null
        // We exclude 'operario' from UI access
        const roleData = roleResult.data;
        if (roleData === 'operario') {
          setRole(null);
          sessionStorage.removeItem('cached_role');
        } else {
          setRole(roleData as AppRole);
          // Cache role for faster reloads
          if (roleData) {
            sessionStorage.setItem('cached_role', roleData);
            sessionStorage.setItem('cached_user_id', userId);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      if (currentUserIdRef.current === userId) {
        setRoleLoading(false);
      }
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  }, [user, fetchUserData]);

  useEffect(() => {
    let isMounted = true;

    // Try to restore cached role for instant UI while fetching fresh data
    const cachedRole = sessionStorage.getItem('cached_role');
    const cachedUserId = sessionStorage.getItem('cached_user_id');

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;

        const newUserId = newSession?.user?.id ?? null;
        const previousUserId = currentUserIdRef.current;

        // Update session and user synchronously
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Handle user changes
        if (event === 'SIGNED_OUT') {
          currentUserIdRef.current = null;
          initializedRef.current = false;
          setProfile(null);
          setRole(null);
          setLoading(false);
          setRoleLoading(false);
          // Clear all cached data on logout
          clearAllCaches();
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // If user changed, clear cache to prevent data leakage
          if (previousUserId && previousUserId !== newUserId) {
            clearAllCaches();
            initializedRef.current = false;
          }
        }

        // Defer Supabase calls with setTimeout to prevent deadlocks
        if (newSession?.user) {
          currentUserIdRef.current = newSession.user.id;
          
          // Only fetch if not already initialized (prevents double fetch)
          if (!initializedRef.current) {
            initializedRef.current = true;
            setTimeout(() => {
              if (isMounted && currentUserIdRef.current === newSession.user.id) {
                fetchUserData(newSession.user.id).finally(() => {
                  if (isMounted) setLoading(false);
                });
              }
            }, 0);
          }
        } else {
          currentUserIdRef.current = null;
          setProfile(null);
          setRole(null);
          setLoading(false);
          setRoleLoading(false);
        }
      }
    );

    // THEN check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        setSession(existingSession);
        setUser(existingSession?.user ?? null);
        
        if (existingSession?.user) {
          currentUserIdRef.current = existingSession.user.id;
          
          // Apply cached role immediately if user matches (for faster UX)
          if (cachedRole && cachedUserId === existingSession.user.id) {
            setRole(cachedRole as AppRole);
            setRoleLoading(false);
          }
          
          // Mark as initialized to prevent onAuthStateChange from double-fetching
          initializedRef.current = true;
          await fetchUserData(existingSession.user.id);
        } else {
          setRoleLoading(false);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setRoleLoading(false);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, clearAllCaches]);

  const signIn = async (email: string, password: string) => {
    // Reset initialized flag to allow fresh fetch on sign in
    initializedRef.current = false;
    setRoleLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Clear cache BEFORE signing out to ensure clean state
    clearAllCaches();
    initializedRef.current = false;
    
    await supabase.auth.signOut();
    
    // Reset all state
    currentUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const value = {
    user,
    session,
    profile,
    role,
    loading,
    roleLoading,
    signIn,
    signUp,
    signOut,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
