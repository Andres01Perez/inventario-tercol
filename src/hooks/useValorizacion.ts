import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ValorizacionBodega, ValorizacionFamilia, ValorizacionRow } from '@/lib/valorizacion';

export function useValorizacion(inventoryId: string | null) {
  return useQuery<ValorizacionRow[]>({
    queryKey: ['valorizacion-bodega', inventoryId],
    enabled: !!inventoryId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('valorizacion_bodega', {
        _inventory_id: inventoryId!,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
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
      }));
    },
  });
}