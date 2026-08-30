import React from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Archive } from 'lucide-react';

/**
 * Aviso visible cuando se consulta un inventario histórico (cerrado).
 * La base de datos rechaza cualquier escritura sobre estos inventarios.
 */
const ReadOnlyBanner: React.FC = () => {
  const { isReadOnly, inventory } = useInventory();

  if (!isReadOnly) return null;

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
};

export default ReadOnlyBanner;
