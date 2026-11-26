import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ValorizacionBodega,
  ValorizacionFamilia,
  ValorizacionResumenRow,
  ValorizacionRow,
} from '@/lib/valorizacion';

const PAGE_SIZE = 1000;

export function useValorizacion(inventoryId: string | null) {
  return useQuery<ValorizacionRow[]>({
    queryKey: ['valorizacion-bodega', inventoryId],
    enabled: !!inventoryId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!inventoryId) return [];
      const all: ValorizacionRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .rpc('valorizacion_bodega', { _inventory_id: inventoryId })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const batch = data ?? [];
        for (const r of batch) {
          all.push({
            referencia: r.referencia,
            familia: r.familia as ValorizacionFamilia,
            bodega: r.bodega as ValorizacionBodega,
            control: r.control,
            erp_bodega: Number(r.erp_bodega ?? 0),
            costo_u: Number(r.costo_u ?? 0),
            sin_costo: Boolean(r.sin_costo),
            cant_a_montar: Number(r.cant_a_montar ?? 0),
            estado: r.estado,
            num_ubicaciones: Number(r.num_ubicaciones ?? 0),
            valor_inicial: Number(r.valor_inicial ?? 0),
            valor_a_montar: Number(r.valor_a_montar ?? 0),
            dif_valor: Number(r.dif_valor ?? 0),
            cant_validada_inactivas: Number(r.cant_validada_inactivas ?? 0),
            origen: r.origen === 'ajuste_cierre' ? 'ajuste_cierre' : 'validado',
            motivo_ajuste: r.motivo_ajuste,
            soporte_ajuste: r.soporte_ajuste,
          });
        }
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
  });
}

export function useValorizacionResumen(inventoryId: string | null) {
  return useQuery<ValorizacionResumenRow[]>({
    queryKey: ['valorizacion-resumen', inventoryId],
    enabled: !!inventoryId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!inventoryId) return [];
      const { data, error } = await supabase.rpc('valorizacion_resumen', {
        _inventory_id: inventoryId,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        familia: r.familia as ValorizacionFamilia,
        bodega: r.bodega as ValorizacionBodega,
        referencias: Number(r.referencias ?? 0),
        total_inv_inicial: Number(r.total_inv_inicial ?? 0),
        total_inv_a_montar: Number(r.total_inv_a_montar ?? 0),
        costo_dif_negativa: Number(r.costo_dif_negativa ?? 0),
        costo_dif_positiva: Number(r.costo_dif_positiva ?? 0),
        valor_ajustes_cierre: Number(r.valor_ajustes_cierre ?? 0),
      }));
    },
  });
}