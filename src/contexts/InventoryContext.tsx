import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export interface Inventory {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_cierre: string | null;
  status: string;
  created_at: string;
}

interface InventoryContextType {
  /** Inventario sobre el que trabaja la vista actual */
  inventoryId: string | null;
  /** Inventario abierto (único). Es el que usan todos los roles no-superadmin */
  activeInventoryId: string | null;
  inventory: Inventory | null;
  inventories: Inventory[];
  /** true cuando se está mirando un inventario cerrado (histórico) */
  isReadOnly: boolean;
  /** Solo el superadmin puede cambiar de inventario */
  canSwitch: boolean;
  loading: boolean;
  setSelectedInventoryId: (id: string) => void;
  refetchInventories: () => void;
}

const STORAGE_KEY = 'tercol.selected_inventory';

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const useInventory = (): InventoryContextType => {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within an InventoryProvider');
  return ctx;
};

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, roleLoading } = useAuth();
  const queryClient = useQueryClient();
  const isSuperadmin = role === 'superadmin';

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const { data: inventories = [], isLoading, refetch } = useQuery({
    queryKey: ['inventories', user?.id],
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventories')
        .select('id, nombre, fecha_inicio, fecha_cierre, status, created_at')
        .order('fecha_inicio', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Inventory[];
    },
  });

  const activeInventoryId = useMemo(
    () => inventories.find((i) => i.status === 'abierto')?.id ?? null,
    [inventories]
  );

  // Los roles operativos SIEMPRE trabajan sobre el inventario abierto.
  const inventoryId = useMemo(() => {
    if (!isSuperadmin) return activeInventoryId;
    if (selectedId && inventories.some((i) => i.id === selectedId)) return selectedId;
    return activeInventoryId;
  }, [isSuperadmin, selectedId, inventories, activeInventoryId]);

  const inventory = useMemo(
    () => inventories.find((i) => i.id === inventoryId) ?? null,
    [inventories, inventoryId]
  );

  const setSelectedInventoryId = (id: string) => {
    if (!isSuperadmin) return;
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* noop */
    }
    // Al cambiar de inventario, ninguna caché anterior sirve
    queryClient.clear();
  };

  // Limpia la selección guardada si el inventario ya no existe
  useEffect(() => {
    if (selectedId && inventories.length > 0 && !inventories.some((i) => i.id === selectedId)) {
      setSelectedId(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  }, [selectedId, inventories]);

  const value: InventoryContextType = {
    inventoryId,
    activeInventoryId,
    inventory,
    inventories,
    isReadOnly: !!inventoryId && inventoryId !== activeInventoryId,
    canSwitch: isSuperadmin,
    loading: isLoading || roleLoading,
    setSelectedInventoryId,
    refetchInventories: refetch,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};
