import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/contexts/InventoryContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Download, Upload, RotateCcw, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { formatQty, formatMoney, formatSignedMoney } from '@/lib/format';
import { parseAjustesExcel, downloadAjustesTemplate, exportAjustesBackup, exportAjustesLote, type AjustePreview } from '@/lib/ajustesCierre';

const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value));
function exportWorkbook(rows: Record<string, unknown>[], name: string) {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ajustes'); XLSX.writeFile(wb, name);
}
export default function AjustesCierrePanel() {
  const { role } = useAuth(); const { inventoryId, inventory, isReadOnly } = useInventory();
  const cache = useQueryClient(); const input = useRef<HTMLInputElement>(null);
  const currentInventory = useRef(inventoryId);
  currentInventory.current = inventoryId;
  const [open, setOpen] = useState(false); const [rows, setRows] = useState<AjustePreview[]>([]);
  const [name, setName] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null); const [revert, setRevert] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const canWrite = role === 'superadmin' && !isReadOnly && inventory?.status === 'abierto';
  useEffect(() => { setRows([]); setConfirm(''); setName(''); setOpen(false); setSelected(null); setRevert(null); setError(''); }, [inventoryId]);
  const { data: batches = [], error: batchError, isLoading } = useQuery({ queryKey: ['ajustes-lotes', inventoryId], enabled: !!inventoryId,
    queryFn: async () => {
      if (!inventoryId) return [];
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('ajustes_cierre_lotes').select('*').eq('inventory_id', inventoryId).order('created_at', { ascending: false }).order('id').range(from, from + 999);
        if (error) throw error; all.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) return all;
      }
    }
  });
  const { data: adjustments = [], error: detailError, isLoading: loadingDetails } = useQuery({ queryKey: ['ajustes-detalle-lotes', inventoryId], enabled: !!inventoryId,
    queryFn: async () => {
      if (!inventoryId) return [];
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('ajustes_cierre').select('*').eq('inventory_id', inventoryId).order('created_at', { ascending: false }).order('id').range(from, from + 999);
        if (error) throw error; all.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) return all;
      }
    }
  });
  const { data: profiles = [] } = useQuery({ queryKey: ['ajustes-usuarios'], queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('id,full_name,email'); if (error) throw error; return data ?? [];
  }});
  async function preview(file: File) {
    if (!inventoryId || !canWrite) return;
    const selectedInventory = inventoryId;
    setBusy(true); setError(''); setRows([]); setConfirm(''); setName(file.name);
    try {
      const parsed = parseAjustesExcel(await file.arrayBuffer());
      const { data, error } = await supabase.rpc('previsualizar_ajustes_cierre', { _inventory_id: selectedInventory, _filas: asJson(parsed) });
      if (error) throw error;
      if (currentInventory.current === selectedInventory) setRows(data as unknown as AjustePreview[]);
    } catch (e) { if (currentInventory.current === selectedInventory) setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e)); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!inventoryId || !canWrite || busy || confirm !== 'APLICAR' || !rows.length || rows.some(r => r.errores.length)) return;
    setBusy(true); setError('');
    try {
      exportAjustesBackup(rows, inventory?.nombre ?? 'Inventario');
      const payload = rows.map(r => ({ fila: r.fila, referencia: r.referencia, bodega: r.bodega, familia: r.familia, cantidad_final: r.cantidad_final, motivo: r.motivo, soporte: r.soporte, observacion: r.observacion, revision: r.revision }));
      const { data, error } = await supabase.rpc('aplicar_ajustes_cierre', { _inventory_id: inventoryId, _nombre_archivo: name, _filas: asJson(payload) });
      if (error) throw error;
      const result = data as { aplicadas?: number; lote_id?: string };
      toast.success(`${result.aplicadas ?? rows.length} ajustes aplicados · respaldo descargado`);
      setOpen(false); setRows([]); setConfirm(''); setSelected(result.lote_id ?? null); await cache.invalidateQueries();
    } catch (e) {
      const message = (e as { message?: string }).message ?? String(e); setError(message); toast.error(message); setConfirm('');
      // A failed transaction requires a fresh review, not a retry of an obsolete preview.
      setRows([]);
    } finally { setBusy(false); }
  }
  async function undo() {
    if (!revert || !canWrite || !reason.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('revertir_ajustes_cierre', { _lote_id: revert, _motivo: reason.trim() });
      if (error) throw error; toast.success('Lote revertido; valores anteriores restaurados'); setRevert(null); setReason(''); await cache.invalidateQueries();
    } catch (e) { toast.error((e as { message?: string }).message ?? String(e)); }
    finally { setBusy(false); }
  }
  const totals = ['MP', 'PP'].flatMap(familia => ['almacen', 'planta'].map(bodega => ({ familia, bodega, valor: rows.filter(r => r.familia === familia && r.bodega === bodega).reduce((s, r) => s + Number(r.impacto_valor ?? 0), 0) })));
  const details = adjustments.filter(a => a.lote_id === selected);
  const errors = rows.filter(r => r.errores.length > 0).length;
  return <section className="space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">Lotes de ajustes</h2>
      {canWrite && <Button onClick={() => { setRows([]); setName(''); setConfirm(''); setError(''); setOpen(true); }}><Upload className="w-4 h-4 mr-2" />Importar ajustes de cierre</Button>}
    </div>
    {batchError && <p role="alert" className="text-destructive">{batchError.message}</p>}
    {detailError && <p role="alert" className="text-destructive">{detailError.message}</p>}
    <div className="overflow-x-auto"><Table><TableHeader><TableRow>{['Fecha', 'Usuario', 'Archivo', 'Filas', 'Impacto $', 'Estado', 'Acciones'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
      {batches.map(b => <TableRow key={b.id}><TableCell className="whitespace-nowrap">{new Date(b.created_at).toLocaleString('es-CO')}</TableCell><TableCell>{profiles.find(p => p.id === b.creado_por)?.full_name ?? b.creado_por}</TableCell><TableCell className="break-all">{b.nombre_archivo}</TableCell><TableCell>{b.aplicadas} / {b.total_filas}</TableCell><TableCell className="whitespace-nowrap">{formatSignedMoney(adjustments.filter(a => a.lote_id === b.id).reduce((s, a) => s + Number(a.impacto_valor), 0))}</TableCell><TableCell><Badge variant="outline">{b.estado}</Badge></TableCell><TableCell><div className="flex gap-1">
        <Button variant="ghost" size="icon" aria-label="Ver lote" title="Ver lote" onClick={() => setSelected(b.id)}><Eye className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="Exportar lote" title="Exportar lote" disabled={loadingDetails || !!detailError || adjustments.filter(a => a.lote_id === b.id).length !== b.aplicadas} onClick={() => exportAjustesLote(adjustments.filter(a => a.lote_id === b.id).map(a => ({ ...a, estado_lote: b.estado, archivo: b.nombre_archivo, motivo_reversion: b.motivo_reversion, revertido_por: b.revertido_por, revertido_at: b.revertido_at })), `Ajustes_${b.id}.xlsx`)}><Download className="w-4 h-4" /></Button>
        {canWrite && b.estado === 'aplicado' && <Button variant="ghost" size="icon" aria-label="Revertir lote" title="Revertir lote" onClick={() => { setRevert(b.id); setReason(''); }}><RotateCcw className="w-4 h-4" /></Button>}
      </div></TableCell></TableRow>)}
      {!batches.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{isLoading ? 'Cargando lotes…' : 'No hay lotes de ajustes'}</TableCell></TableRow>}
    </TableBody></Table></div>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}><DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] flex flex-col overflow-hidden"><DialogHeader><DialogTitle>Importar ajustes de cierre</DialogTitle><DialogDescription>{inventory?.nombre} · Se actualizará la cantidad a montar, sin cambiar los conteos.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={downloadAjustesTemplate}><Download className="w-4 h-4 mr-2" />Plantilla</Button><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="w-4 h-4 mr-2" />Seleccionar Excel</Button><input ref={input} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void preview(file); e.target.value = ''; }} /><span className="text-sm break-all">{name}</span></div>
      {busy && <p className="flex gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Procesando…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {rows.length > 0 && <><div className="text-sm flex flex-wrap gap-3"><span>{rows.length} filas · {errors} con errores</span>{totals.map(t => <span key={t.familia + t.bodega}>{t.familia} · {t.bodega}: {formatSignedMoney(t.valor)}</span>)}</div>
        <div className="overflow-auto flex-1 min-h-0"><Table><TableHeader><TableRow>{['Fila', 'Referencia', 'Bodega', 'Familia', 'Estado actual', 'A montar actual', 'Cantidad final', 'Diferencia und', 'Costo u', 'Impacto $', 'Ubicaciones', 'Crear ubicación', 'Validación', 'Motivo', 'Soporte', 'Observación'].map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(r => <TableRow key={r.fila}><TableCell>{r.fila}</TableCell><TableCell className="font-medium whitespace-nowrap">{r.referencia}</TableCell><TableCell>{r.bodega}</TableCell><TableCell>{r.familia}</TableCell><TableCell>{r.estado_actual ?? '—'}</TableCell><TableCell>{formatQty(r.cantidad_anterior)}</TableCell><TableCell>{r.cantidad_final === null ? '—' : formatQty(r.cantidad_final)}</TableCell><TableCell>{formatQty(r.diferencia)}</TableCell><TableCell>{formatMoney(r.costo_u)}</TableCell><TableCell className="whitespace-nowrap">{formatSignedMoney(r.impacto_valor)}</TableCell><TableCell>{r.num_ubicaciones}</TableCell><TableCell>{r.creara_ubicacion ? 'Sí' : 'No'}</TableCell><TableCell className="min-w-[240px]"><span className={r.errores.length ? 'text-destructive' : ''}>{r.errores.length ? r.errores.join('; ') : 'OK'}</span>{r.advertencias.map(w => <p className="text-muted-foreground text-xs" key={w}>Advertencia: {w}</p>)}</TableCell><TableCell className="min-w-[180px]">{r.motivo}</TableCell><TableCell className="min-w-[300px] break-words">{r.soporte}</TableCell><TableCell className="min-w-[240px]">{r.observacion}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="confirm-ajustes">Escribe APLICAR para confirmar</Label><Input id="confirm-ajustes" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></div><Button variant="outline" disabled={busy} onClick={() => exportAjustesBackup(rows, inventory?.nombre ?? 'Inventario')}><Download className="w-4 h-4 mr-2" />Respaldo anterior</Button><Button variant="outline" onClick={() => exportWorkbook(rows.map(({ snapshot, ...r }) => ({ ...r, errores: r.errores.join('; '), advertencias: r.advertencias.join('; ') })), 'Previsualizacion_Ajustes.xlsx')}><Download className="w-4 h-4 mr-2" />Exportar revisión</Button></div>
      </>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!canWrite || busy || !rows.length || errors > 0 || confirm !== 'APLICAR'} onClick={apply}>Aplicar ajustes</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent className="max-w-[95vw] w-[1000px] max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>Detalle del lote</DialogTitle><DialogDescription>{selected}</DialogDescription></DialogHeader><Table><TableHeader><TableRow>{['Referencia', 'Bodega', 'Antes', 'Final', 'Impacto $', 'Motivo / soporte'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{details.map(d => <TableRow key={d.id}><TableCell>{d.referencia}</TableCell><TableCell>{d.bodega}</TableCell><TableCell>{formatQty(d.cantidad_anterior)}</TableCell><TableCell>{formatQty(d.cantidad_final)}</TableCell><TableCell>{formatSignedMoney(d.impacto_valor)}</TableCell><TableCell><p>{d.motivo}</p><p className="text-xs text-muted-foreground break-all">{d.soporte}</p><p className="text-xs">{d.observacion}</p></TableCell></TableRow>)}</TableBody></Table></DialogContent></Dialog>
    <Dialog open={!!revert} onOpenChange={v => { if (!busy && !v) setRevert(null); }}><DialogContent><DialogHeader><DialogTitle>Revertir lote completo</DialogTitle><DialogDescription>Se restaurarán los valores anteriores. Si existen cambios posteriores, no se modificará ninguna referencia.</DialogDescription></DialogHeader><Label htmlFor="motivo-reversion">Motivo obligatorio</Label><Textarea id="motivo-reversion" value={reason} onChange={e => setReason(e.target.value)} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRevert(null)}>Cancelar</Button><Button variant="destructive" disabled={busy || !reason.trim() || !canWrite} onClick={undo}>Revertir lote</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}