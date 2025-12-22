import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import UnifiedDashboard from './UnifiedDashboard';
import PendingApproval from './PendingApproval';

const Dashboard: React.FC = () => {
  const { role, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no user, redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If user has a valid role, show unified dashboard
  if (role === 'superadmin' || role === 'admin_mp' || role === 'admin_pp' || role === 'supervisor') {
    return <UnifiedDashboard />;
  }

  // User has no role or role is null - show pending approval
  return <PendingApproval />;
};

export default Dashboard;
