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

const queryClient = new QueryClient();

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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
