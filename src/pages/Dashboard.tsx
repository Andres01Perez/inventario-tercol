import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import OperarioDashboard from './OperarioDashboard';

const Dashboard: React.FC = () => {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to role-specific dashboard
  switch (role) {
    case 'admin':
      return <AdminDashboard />;
    case 'supervisor':
      return <SupervisorDashboard />;
    case 'operario':
      return <OperarioDashboard />;
    default:
      return <Navigate to="/auth" replace />;
  }
};

export default Dashboard;
