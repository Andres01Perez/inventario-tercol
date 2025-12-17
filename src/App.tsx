import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import InventarioMP from "./pages/superadmin/InventarioMP";
import InventarioPP from "./pages/superadmin/InventarioPP";
import GestionUbicacion from "./pages/admin/GestionUbicacion";
import GestionResponsables from "./pages/admin/GestionResponsables";
import GestionOperativa from "./pages/GestionOperativa";
import Asignacion from "./pages/supervisor/Asignacion";
import Transcripcion from "./pages/supervisor/Transcripcion";

// Configure QueryClient with proper defaults for multi-user isolation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection)
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      retry: 1, // Only retry once on failure
    },
  },
});

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            {/* Superadmin Routes */}
            <Route
              path="/superadmin/inventario-mp"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <InventarioMP />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/inventario-pp"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <InventarioPP />
                </ProtectedRoute>
              }
            />
            {/* Admin Routes */}
            <Route
              path="/admin/gestion-ubicacion"
              element={
                <ProtectedRoute allowedRoles={['admin_mp', 'admin_pp']}>
                  <GestionUbicacion />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/gestion-responsables"
              element={
                <ProtectedRoute allowedRoles={['admin_mp', 'admin_pp']}>
                  <GestionResponsables />
                </ProtectedRoute>
              }
            />
            {/* Gestión Operativa - accessible by superadmin, admin_mp, admin_pp */}
            <Route
              path="/gestion-operativa"
              element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin_mp', 'admin_pp']}>
                  <GestionOperativa />
                </ProtectedRoute>
              }
            />
            {/* Supervisor Routes */}
            <Route
              path="/dashboard/asignacion"
              element={
                <ProtectedRoute allowedRoles={['supervisor']}>
                  <Asignacion />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/transcripcion"
              element={
                <ProtectedRoute allowedRoles={['supervisor']}>
                  <Transcripcion />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
