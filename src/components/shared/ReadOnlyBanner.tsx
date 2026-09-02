import React from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Archive, Eye } from 'lucide-react';

/**
 * Aviso visible cuando se consulta un inventario histórico (cerrado)
 * o cuando el usuario tiene un rol de solo consulta (visualizador).
 */
const ReadOnlyBanner: React.FC = () => {
  const { isReadOnly, inventory } = useInventory();
  const { role } = useAuth();
  const isViewerRole = role === 'visualizador';

  if (!isReadOnly && !isViewerRole) return null;

  if (isReadOnly) {
    return (
      <Alert className="mb-4 border-destructive/40">
        <Archive className="h-4 w-4" />
        <AlertTitle>Histórico — solo lectura</AlertTitle>
        <AlertDescription>
          Estás consultando el inventario <strong>{inventory?.nombre}</strong>, que ya fue cerrado.
          Puedes ver y exportar la información, pero no modificarla.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4 border-sky-500/40">
      <Eye className="h-4 w-4" />
      <AlertTitle>Modo consulta</AlertTitle>
      <AlertDescription>
        Tu perfil es de solo lectura: puedes buscar, filtrar y exportar la información,
        pero no editar ni validar conteos.
      </AlertDescription>
    </Alert>
  );
};

export default ReadOnlyBanner;
