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
import GestionOperativa from "./pages/GestionOperativa";
import InventarioMP from "./pages/superadmin/InventarioMP";
import InventarioPP from "./pages/superadmin/InventarioPP";
import Usuarios from "./pages/superadmin/Usuarios";
import ImportarMaestra from "./pages/superadmin/ImportarMaestra";
import Criticos from "./pages/superadmin/Criticos";
import Auditoria from "./pages/superadmin/Auditoria";
import Operarios from "./pages/superadmin/Operarios";
import GestionUbicacion from "./pages/admin/GestionUbicacion";
import GestionResponsables from "./pages/admin/GestionResponsables";

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
            {/* Shared Routes */}
            <Route
              path="/gestion-operativa"
              element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin_mp', 'admin_pp', 'supervisor']}>
                  <GestionOperativa />
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
            <Route
              path="/superadmin/usuarios"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <Usuarios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/importar"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <ImportarMaestra />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/criticos"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <Criticos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/operarios"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <Operarios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/auditoria"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <Auditoria />
                </ProtectedRoute>
              }
            />
            {/* Admin Routes */}
            <Route
              path="/admin/gestion-ubicacion"
              element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin_mp', 'admin_pp']}>
                  <GestionUbicacion />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/gestion-responsables"
              element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin_mp', 'admin_pp']}>
                  <GestionResponsables />
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
