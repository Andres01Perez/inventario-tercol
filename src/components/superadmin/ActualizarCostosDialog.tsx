import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatMoney, formatQty } from '@/lib/format';
import {
  type CostMaterialType,
  type CostUpdatePreview,
  type MasterCostRecord,
  normalizeRef,
  parseCostUpdateExcel,
  buildCostUpdatePreview,
  downloadCostUpdateTemplate,
  downloadCostUpdatePreview,
} from '@/lib/costUpdate';

interface ActualizarCostosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialType: CostMaterialType;
  inventoryId: string;
  onSuccess?: () => void;
}

type Step = 'upload' | 'preview' | 'done';

interface ApplyResult {
  updated: number;
  unchanged: number;
  not_found: number;
}

const PAGE_SIZE = 1000;

async function fetchAllMasterCosts(
  inventoryId: string,
  materialType: CostMaterialType
): Promise<Map<string, MasterCostRecord>> {
  const map = new Map<string, MasterCostRecord>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inventory_master')
      .select('referencia, costo_u_mp, costo_u_pp, cant_t_mp, cant_total_pp, costo_t')
      .eq('inventory_id', inventoryId)
      .eq('material_type', materialType)
      .order('referencia')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const norm = normalizeRef(r.referencia);
      map.set(norm, {
        referencia: r.referencia,
        costoActual: materialType === 'MP' ? r.costo_u_mp : r.costo_u_pp,
        cantTotal: (materialType === 'MP' ? r.cant_t_mp : r.cant_total_pp) ?? 0,
        costoTActual: r.costo_t,
      });
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return map;
}

const ActualizarCostosDialog: React.FC<ActualizarCostosDialogProps> = ({
  open,
  onOpenChange,
  materialType,
  inventoryId,
  onSuccess,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CostUpdatePreview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const resetState = () => {
    setStep('upload');
    setFileName('');
    setParseError(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setParseError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseCostUpdateExcel(buffer);
      if (parsed.error) {
        setParseError(parsed.error);
        return;
      }
      const masterMap = await fetchAllMasterCosts(inventoryId, materialType);
      const built = buildCostUpdatePreview(parsed.rows, masterMap);
      setPreview(built);
      setStep('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error leyendo el archivo';
      setParseError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || preview.toUpdate.length === 0) return;
    setSaving(true);
    try {
      const items = preview.toUpdate.map((r) => ({
        referencia: r.referencia,
        costo_u: r.costoNuevo,
      }));
      const { data, error } = await supabase.rpc('update_master_costs', {
        _inventory_id: inventoryId,
        _material_type: materialType,
        _items: items,
        _file_name: fileName || null,
      });
      if (error) throw error;

      const res = data as unknown as ApplyResult;
      setResult(res);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['inventory-mp'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-pp'] });
      queryClient.invalidateQueries({ queryKey: ['valorizacion-resumen'] });
      queryClient.invalidateQueries({ queryKey: ['valorizacion-detalle'] });
      onSuccess?.();
      toast({
        title: 'Costos actualizados',
        description: `${res.updated} referencias actualizadas en ${materialType}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudieron actualizar los costos';
      toast({ title: 'Error al actualizar costos', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const varColorClass = (varPct: number | null) => {
    if (varPct === null || varPct === 0) return 'text-muted-foreground';
    return varPct > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
  };

  const formatVarPct = (varPct: number | null) => {
    if (varPct === null) return 'Nuevo';
    const sign = varPct > 0 ? '+' : '';
    return `${sign}${varPct.toFixed(1)}%`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Actualizar costos — Inventario {materialType}</DialogTitle>
          <DialogDescription>
            Actualiza únicamente el costo unitario y el costo total del inventario seleccionado. No
            borra ni modifica maestra, ubicaciones ni conteos.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-3">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Sube un archivo Excel (.xlsx o .xls) con las columnas{' '}
                <span className="font-medium text-foreground">Referencia</span> y{' '}
                <span className="font-medium text-foreground">CostoU</span>.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analizando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Seleccionar Excel
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadCostUpdateTemplate(materialType)}
                  disabled={loading}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar plantilla
                </Button>
              </div>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              <div className="border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">Total filas</div>
                <div className="text-lg font-semibold">{preview.totalRows}</div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">A actualizar</div>
                <div className="text-lg font-semibold text-primary">{preview.toUpdate.length}</div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">Sin cambio</div>
                <div className="text-lg font-semibold">{preview.unchanged.length}</div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">No encontradas</div>
                <div className="text-lg font-semibold text-amber-600">{preview.notFound.length}</div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">Duplicadas</div>
                <div className="text-lg font-semibold text-destructive">
                  {preview.duplicates.length}
                </div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">Inválidas</div>
                <div className="text-lg font-semibold text-destructive">
                  {preview.invalid.length}
                </div>
              </div>
            </div>

            <Tabs defaultValue="update" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="w-fit">
                <TabsTrigger value="update">A actualizar ({preview.toUpdate.length})</TabsTrigger>
                <TabsTrigger value="notFound">
                  No encontradas ({preview.notFound.length})
                </TabsTrigger>
                <TabsTrigger value="duplicates">
                  Duplicadas ({preview.duplicates.length})
                </TabsTrigger>
                {preview.invalid.length > 0 && (
                  <TabsTrigger value="invalid">Inválidas ({preview.invalid.length})</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="update" className="flex-1 overflow-auto border rounded-md mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-right">Costo actual</TableHead>
                      <TableHead className="text-right">Costo nuevo</TableHead>
                      <TableHead className="text-right">Var %</TableHead>
                      <TableHead className="text-right">Cant. total</TableHead>
                      <TableHead className="text-right">Costo total nuevo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.toUpdate.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          No hay referencias con cambios de costo para actualizar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      preview.toUpdate.map((r) => (
                        <TableRow key={r.referencia}>
                          <TableCell className="font-mono text-xs">{r.referencia}</TableCell>
                          <TableCell className="text-right">
                            {r.costoActual !== null ? formatMoney(r.costoActual) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(r.costoNuevo)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${varColorClass(r.varPct)}`}>
                            {formatVarPct(r.varPct)}
                          </TableCell>
                          <TableCell className="text-right">{formatQty(r.cantTotal)}</TableCell>
                          <TableCell className="text-right">{formatMoney(r.costoTNuevo)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="notFound" className="flex-1 overflow-auto border rounded-md mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fila</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-right">CostoU</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.notFound.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                          Todas las referencias existen en este inventario ({materialType}).
                        </TableCell>
                      </TableRow>
                    ) : (
                      preview.notFound.map((r) => (
                        <TableRow key={`${r.excelRow}-${r.referencia}`}>
                          <TableCell>{r.excelRow}</TableCell>
                          <TableCell className="font-mono text-xs">{r.referencia}</TableCell>
                          <TableCell className="text-right">{formatMoney(r.costoNuevo)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent
                value="duplicates"
                className="flex-1 overflow-auto border rounded-md mt-2"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Filas en Excel</TableHead>
                      <TableHead>Valores encontrados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.duplicates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                          No hay referencias duplicadas en el archivo.
                        </TableCell>
                      </TableRow>
                    ) : (
                      preview.duplicates.map((d) => (
                        <TableRow key={d.refNorm}>
                          <TableCell className="font-mono text-xs">{d.refNorm}</TableCell>
                          <TableCell>{d.rows.join(', ')}</TableCell>
                          <TableCell>{d.values.join(', ')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              {preview.invalid.length > 0 && (
                <TabsContent
                  value="invalid"
                  className="flex-1 overflow-auto border rounded-md mt-2"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fila</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.invalid.map((r) => (
                        <TableRow key={`${r.excelRow}-${r.rawRef}`}>
                          <TableCell>{r.excelRow}</TableCell>
                          <TableCell className="font-mono text-xs">{r.rawRef || '—'}</TableCell>
                          <TableCell>{r.rawCost || '—'}</TableCell>
                          <TableCell className="text-destructive">{r.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <h3 className="text-lg font-semibold">Actualización completada</h3>
            <p className="text-sm text-muted-foreground">
              Se actualizaron <span className="font-semibold text-foreground">{result.updated}</span>{' '}
              referencias. Sin cambio: {result.unchanged}. Omitidas: {result.not_found}.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'preview' && preview && (
            <>
              <Button variant="outline" onClick={resetState} disabled={saving}>
                Cambiar archivo
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadCostUpdatePreview(preview, materialType)}
                disabled={saving}
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar previsualización
              </Button>
              <Button onClick={handleConfirm} disabled={saving || preview.toUpdate.length === 0}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  `Confirmar y actualizar (${preview.toUpdate.length})`
                )}
              </Button>
            </>
          )}
          {step === 'done' && <Button onClick={() => handleClose(false)}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ActualizarCostosDialog;