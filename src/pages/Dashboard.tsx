import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import SuperadminDashboard from './SuperadminDashboard';
import AdminDashboard from './AdminDashboard';
import SupervisorDashboard from './SupervisorDashboard';
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

  // Redirect to role-specific dashboard
  switch (role) {
    case 'superadmin':
      return <SuperadminDashboard />;
    case 'admin_mp':
    case 'admin_pp':
      return <AdminDashboard />;
    case 'supervisor':
      return <SupervisorDashboard />;
    default:
      // User has no role or role is null - show pending approval
      return <PendingApproval />;
  }
};

export default Dashboard;
