import React from 'react';
import { useInventory } from '@/contexts/InventoryContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Archive, CalendarRange } from 'lucide-react';

/**
 * Selector de inventario. Se renderiza ÚNICAMENTE para superadmin.
 * El resto de roles trabajan siempre sobre el inventario abierto.
 */
const InventorySelector: React.FC = () => {
  const { canSwitch, inventories, inventoryId, isReadOnly, setSelectedInventoryId, loading } = useInventory();

  if (!canSwitch || loading || inventories.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={inventoryId ?? undefined} onValueChange={setSelectedInventoryId}>
        <SelectTrigger className="w-[230px] h-9">
          <SelectValue placeholder="Seleccionar inventario" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {inventories.map((inv) => (
            <SelectItem key={inv.id} value={inv.id}>
              <span className="flex items-center gap-2">
                {inv.nombre}
                {inv.status === 'abierto' ? (
                  <Badge variant="secondary" className="text-[10px]">Activo</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Histórico</Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isReadOnly && (
        <Badge variant="destructive" className="gap-1">
          <Archive className="w-3 h-3" />
          Solo lectura
        </Badge>
      )}
    </div>
  );
};

export default InventorySelector;
