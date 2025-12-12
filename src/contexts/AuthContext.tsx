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
  
  // Track current user ID to prevent race conditions
  const currentUserIdRef = useRef<string | null>(null);
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
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    // Prevent stale updates if user changed
    if (currentUserIdRef.current !== userId) {
      return;
    }

    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Check again if user is still the same
      if (currentUserIdRef.current !== userId) {
        return;
      }

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      } else {
        setProfile(profileData);
      }

      // Fetch role using the get_user_role function
      const { data: roleData, error: roleError } = await supabase
        .rpc('get_user_role', { _user_id: userId });

      // Check again if user is still the same
      if (currentUserIdRef.current !== userId) {
        return;
      }

      if (roleError) {
        console.error('Error fetching role:', roleError);
        setRole(null);
      } else {
        // roleData can be 'superadmin' | 'admin' | 'admin_mp' | 'admin_pp' | 'supervisor' | 'operario' | null
        // We exclude 'operario' from UI access
        if (roleData === 'operario') {
          setRole(null);
        } else {
          setRole(roleData as AppRole);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  }, [user, fetchUserData]);

  useEffect(() => {
    let isMounted = true;

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
          setProfile(null);
          setRole(null);
          setLoading(false);
          // Clear all cached data on logout
          clearAllCaches();
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // If user changed, clear cache to prevent data leakage
          if (previousUserId && previousUserId !== newUserId) {
            clearAllCaches();
          }
        }

        // Defer Supabase calls with setTimeout to prevent deadlocks
        if (newSession?.user) {
          currentUserIdRef.current = newSession.user.id;
          setTimeout(() => {
            if (isMounted && currentUserIdRef.current === newSession.user.id) {
              fetchUserData(newSession.user.id).finally(() => {
                if (isMounted) setLoading(false);
              });
            }
          }, 0);
        } else {
          currentUserIdRef.current = null;
          setProfile(null);
          setRole(null);
          setLoading(false);
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
          await fetchUserData(existingSession.user.id);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
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
    signIn,
    signUp,
    signOut,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
