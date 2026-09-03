import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

const PAGE = 1000;

async function fetchAll<T>(table: 'pt_master' | 'pt_locations' | 'pt_counts' | 'pt_validated_counts', inventoryId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('inventory_id', inventoryId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data as T[]) || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

interface MasterRow {
  referencia: string;
  descripcion: string | null;
  cant_erp: number;
  status_slug: string;
  audit_round: number;
  count_history: unknown;
}

const PtBackupExport: React.FC = () => {
  const { inventoryId } = useInventory();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!inventoryId) return;
    setLoading(true);
    try {
      const [master, locations, counts, validated] = await Promise.all([
        fetchAll<MasterRow>('pt_master', inventoryId),
        fetchAll<Record<string, unknown>>('pt_locations', inventoryId),
        fetchAll<Record<string, unknown>>('pt_counts', inventoryId),
        fetchAll<Record<string, unknown>>('pt_validated_counts', inventoryId),
      ]);

      const resumen = master.map((m) => {
        const history = Array.isArray(m.count_history) ? (m.count_history as Record<string, unknown>[]) : [];
        const closed = [...history].reverse().find((h) => h.action === 'closed');
        return {
          REFERENCIA: m.referencia,
          DESCRIPCION: m.descripcion ?? '',
          ERP: m.cant_erp,
          ESTADO: m.status_slug,
          RONDA: m.audit_round,
          CANT_VALIDADA: closed ? Number(closed.total ?? 0) : '',
          RONDA_VALIDADA: closed ? Number(closed.round ?? 0) : '',
          MOTIVO: closed ? String(closed.reason ?? '') : '',
          DESCUADRE: closed ? Number(closed.total ?? 0) - Number(m.cant_erp ?? 0) : '',
        };
      });

      const historial = master.flatMap((m) => {
        const history = Array.isArray(m.count_history) ? (m.count_history as Record<string, unknown>[]) : [];
        return history.map((h) => ({
          REFERENCIA: m.referencia,
          ACCION: String(h.action ?? ''),
          RONDA: h.round ?? '',
          TOTAL: h.total ?? '',
          ERP: h.erp ?? '',
          MOTIVO: h.reason ?? '',
          FECHA: h.timestamp ?? h.at ?? '',
        }));
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historial), 'Historial');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locations), 'Ubicaciones');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(counts), 'Conteos');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(validated), 'Validados');

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `respaldo_PT_${date}.xlsx`);

      toast({
        title: 'Respaldo generado',
        description: `${resumen.length} referencias, ${locations.length} ubicaciones, ${counts.length} conteos`,
      });
    } catch (e) {
      console.error('[PT-BACKUP]', e);
      toast({
        title: 'Error al generar el respaldo',
        description: e instanceof Error ? e.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleExport} disabled={loading || !inventoryId}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
      Descargar respaldo PT
    </Button>
  );
};

export default PtBackupExport;
