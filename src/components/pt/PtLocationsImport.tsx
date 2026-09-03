import React, { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { parsePtLocationsExcel, generatePtLocationsTemplate, ParsedPtLocation } from '@/lib/ptLocationsParser';
import { Upload, Download, Loader2, AlertCircle, AlertTriangle, CheckCircle2, MapPin, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type State = 'idle' | 'parsing' | 'validating' | 'preview' | 'importing' | 'success' | 'error';

interface Props {
  onSuccess: () => void;
}

interface ExistingLocation {
  id: string;
  referencia: string;
  piso: string;
  prodc: string | null;
  ubic: string | null;
  linea: string | null;
  ue: number | null;
  orden: number | null;
}

const BATCH = 500;
const PAGE = 1000;

const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();
const keyOf = (l: { referencia: string; piso: string; prodc?: string | null; ubic?: string | null; linea?: string | null }) =>
  [norm(l.referencia), norm(l.piso), norm(l.prodc), norm(l.ubic), norm(l.linea)].join('|');

const PtLocationsImport: React.FC<Props> = ({ onSuccess }) => {
  const { inventoryId, isReadOnly } = useInventory();
  const { toast } = useToast();
  const [state, setState] = useState<State>('idle');
  const [data, setData] = useState<ParsedPtLocation[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [invalidRefs, setInvalidRefs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [pruneMissing, setPruneMissing] = useState(false);
  const [existingCounts, setExistingCounts] = useState(0);
  const [existingValidated, setExistingValidated] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const reset = () => {
    setState('idle');
    setData([]);
    setErrors([]);
    setWarnings([]);
    setInvalidRefs([]);
    setProgress(0);
    setConfirmText('');
  };

  const validateReferences = async (rows: ParsedPtLocation[]): Promise<string[]> => {
    const uniqueRefs = [...new Set(rows.map((r) => r.referencia))];
    const found = new Set<string>();

    for (let i = 0; i < uniqueRefs.length; i += 100) {
      const batch = uniqueRefs.slice(i, i + 100);
      const { data: existing, error } = await supabase
        .from('pt_master')
        .select('referencia')
        .eq('inventory_id', inventoryId!)
        .in('referencia', batch);
      if (error) throw new Error(`Error al validar referencias: ${error.message}`);
      existing?.forEach((r) => found.add(r.referencia));
    }

    return uniqueRefs.filter((r) => !found.has(r));
  };

  const loadExistingStats = async () => {
    if (!inventoryId) return;
    const [{ count: c }, { count: v }] = await Promise.all([
      supabase.from('pt_counts').select('id', { count: 'exact', head: true }).eq('inventory_id', inventoryId),
      supabase.from('pt_validated_counts').select('id', { count: 'exact', head: true }).eq('inventory_id', inventoryId),
    ]);
    setExistingCounts(c ?? 0);
    setExistingValidated(v ?? 0);
  };

  const fetchExistingLocations = async (): Promise<ExistingLocation[]> => {
    const all: ExistingLocation[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from('pt_locations')
        .select('id, referencia, piso, prodc, ubic, linea, ue, orden')
        .eq('inventory_id', inventoryId!)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...((page as ExistingLocation[]) || []));
      if (!page || page.length < PAGE) break;
    }
    return all;
  };

  const fetchLocationIdsWithCounts = async (): Promise<Set<string>> => {
    const ids = new Set<string>();
    for (const table of ['pt_counts', 'pt_validated_counts'] as const) {
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await supabase
          .from(table)
          .select('location_id')
          .eq('inventory_id', inventoryId!)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        (page || []).forEach((r: { location_id: string }) => ids.add(r.location_id));
        if (!page || page.length < PAGE) break;
      }
    }
    return ids;
  };

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        toast({ title: 'Archivo inválido', description: 'Solo Excel (.xlsx, .xls)', variant: 'destructive' });
        return;
      }
      setState('parsing');
      setErrors([]);
      setWarnings([]);
      setInvalidRefs([]);

      const result = await parsePtLocationsExcel(file);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setState('error');
        return;
      }
      setWarnings(result.warnings);

      setState('validating');
      try {
        const notFound = await validateReferences(result.data);
        if (notFound.length > 0) {
          setInvalidRefs(notFound);
          setState('error');
          return;
        }
        await loadExistingStats();
      } catch (e) {
        setErrors([e instanceof Error ? e.message : 'Error al validar referencias']);
        setState('error');
        return;
      }

      setData(result.data);
      setState('preview');
    },
    [toast, inventoryId]
  );

  const runImport = async () => {
    if (!inventoryId) return;
    setConfirmOpen(false);
    setConfirmText('');
    setState('importing');
    setProgress(0);

    try {
      const existing = await fetchExistingLocations();
      const protectedIds = await fetchLocationIdsWithCounts();

      const existingByKey = new Map<string, ExistingLocation>();
      existing.forEach((l) => {
        if (!existingByKey.has(keyOf(l))) existingByKey.set(keyOf(l), l);
      });

      const fileKeys = new Set(data.map(keyOf));
      const toInsert = data.filter((l) => !existingByKey.has(keyOf(l)));
      const toUpdate = data
        .map((l) => ({ row: l, prev: existingByKey.get(keyOf(l)) }))
        .filter((x) => x.prev && (x.prev.ue !== x.row.ue || x.prev.orden !== x.row.orden));

      // 1) Insertar ubicaciones nuevas
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        const { error } = await supabase.from('pt_locations').insert(
          batch.map((l) => ({
            inventory_id: inventoryId,
            referencia: l.referencia,
            piso: l.piso,
            prodc: l.prodc,
            ubic: l.ubic,
            linea: l.linea,
            ue: l.ue,
            orden: l.orden,
          }))
        );
        if (error) throw error;
        setProgress(Math.round((Math.min(i + BATCH, toInsert.length) / Math.max(toInsert.length, 1)) * 60));
      }

      // 2) Actualizar U.E / orden de las que ya existían
      for (const { row, prev } of toUpdate) {
        const { error } = await supabase
          .from('pt_locations')
          .update({ ue: row.ue, orden: row.orden })
          .eq('id', prev!.id);
        if (error) throw error;
      }
      setProgress(75);

      // 3) Eliminar las que no vienen en el archivo — NUNCA las que tienen conteos
      let deleted = 0;
      let kept = 0;
      if (pruneMissing) {
        const removable = existing.filter((l) => !fileKeys.has(keyOf(l)) && !protectedIds.has(l.id));
        kept = existing.filter((l) => !fileKeys.has(keyOf(l)) && protectedIds.has(l.id)).length;
        for (let i = 0; i < removable.length; i += BATCH) {
          const ids = removable.slice(i, i + BATCH).map((l) => l.id);
          const { error } = await supabase.from('pt_locations').delete().in('id', ids);
          if (error) throw error;
          deleted += ids.length;
        }
      }
      setProgress(90);

      // 4) Aplicar las asignaciones de piso ya configuradas a las ubicaciones nuevas
      const { data: assignments } = await supabase
        .from('pt_floor_assignments')
        .select('piso, supervisor_id')
        .eq('inventory_id', inventoryId);

      for (const a of assignments || []) {
        if (!a.supervisor_id) continue;
        await supabase
          .from('pt_locations')
          .update({ assigned_supervisor_id: a.supervisor_id })
          .eq('inventory_id', inventoryId)
          .eq('piso', a.piso)
          .is('assigned_supervisor_id', null);
      }

      setProgress(100);
      setState('success');
      toast({
        title: 'Ubicaciones PT actualizadas',
        description: `${toInsert.length} nuevas, ${toUpdate.length} actualizadas${
          pruneMissing ? `, ${deleted} eliminadas${kept ? `, ${kept} conservadas por tener conteos` : ''}` : ''
        }`,
      });
      onSuccess();
    } catch (error) {
      console.error('[PT-LOCATIONS-IMPORT]', error);
      setErrors([error instanceof Error ? error.message : 'Error durante la importación']);
      setState('error');
    }
  };

  const handleImportClick = () => {
    if (pruneMissing && existingCounts + existingValidated > 0) {
      setConfirmOpen(true);
      return;
    }
    runImport();
  };

  const pisos = [...new Set(data.map((d) => d.piso))];

  return (
    <div className="space-y-4">
      {state === 'idle' && (
        <>
          <div
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('pt-locations-input')?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">Arrastra el Excel de ubicaciones PT</p>
            <p className="text-sm text-muted-foreground">o haz clic para seleccionar</p>
            <input
              id="pt-locations-input"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex justify-center">
            <Button variant="outline" onClick={generatePtLocationsTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium text-foreground mb-2">Columnas esperadas:</p>
            <div className="flex gap-2 flex-wrap text-muted-foreground">
              <code className="bg-background px-2 py-1 rounded text-xs">#</code>
              <code className="bg-background px-2 py-1 rounded text-xs">PISO*</code>
              <code className="bg-background px-2 py-1 rounded text-xs">PRODC</code>
              <code className="bg-background px-2 py-1 rounded text-xs">UBIC</code>
              <code className="bg-background px-2 py-1 rounded text-xs">LINEA</code>
              <code className="bg-background px-2 py-1 rounded text-xs">REFERENCIA*</code>
              <code className="bg-background px-2 py-1 rounded text-xs">U.E</code>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              * Obligatorias. La referencia debe existir en la maestra PT. Una referencia puede estar en varios pisos.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              La importación agrega y actualiza ubicaciones. Nunca elimina ubicaciones que ya tienen conteos.
            </p>
          </div>
        </>
      )}

      {(state === 'parsing' || state === 'validating') && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">
            {state === 'validating' ? 'Validando referencias contra la maestra PT...' : 'Procesando archivo...'}
          </p>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                {invalidRefs.length > 0 ? (
                  <>
                    <p className="font-medium text-destructive mb-2">
                      Referencias que no existen en la maestra PT ({invalidRefs.length}):
                    </p>
                    <div className="max-h-40 overflow-y-auto bg-background/50 rounded p-2">
                      <ul className="text-sm text-destructive/80 space-y-1 font-mono">
                        {invalidRefs.slice(0, 50).map((r, i) => (
                          <li key={i}>• {r}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-destructive mb-2">Errores encontrados:</p>
                    <ul className="text-sm text-destructive/80 space-y-1 max-h-48 overflow-y-auto">
                      {errors.slice(0, 30).map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                      {errors.length > 30 && <li>... y {errors.length - 30} más</li>}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={reset} className="w-full">
            Intentar de nuevo
          </Button>
        </div>
      )}

      {state === 'preview' && (
        <>
          {warnings.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <ul className="text-sm text-yellow-600/90 dark:text-yellow-400/90 space-y-0.5">
                  {warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {warnings.length > 5 && <li>... y {warnings.length - 5} más</li>}
                </ul>
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-center">
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
              {data.length} ubicaciones
            </Badge>
            <Badge variant="outline">{pisos.length} piso(s): {pisos.slice(0, 8).join(', ')}{pisos.length > 8 ? '…' : ''}</Badge>
            {existingCounts + existingValidated > 0 && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                {existingCounts} conteos y {existingValidated} validaciones ya guardados
              </Badge>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <Checkbox checked={pruneMissing} onCheckedChange={(v) => setPruneMissing(!!v)} className="mt-0.5" />
            <span>
              <span className="font-medium text-destructive">Eliminar las ubicaciones que no vengan en este archivo</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Opcional y destructivo. Las ubicaciones con conteos o validaciones nunca se eliminan.
              </span>
            </span>
          </label>

          <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Piso</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Prodc</TableHead>
                  <TableHead>Ubic</TableHead>
                  <TableHead>Línea</TableHead>
                  <TableHead className="text-right">U.E</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 50).map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.piso}</TableCell>
                    <TableCell className="font-mono text-xs">{l.referencia}</TableCell>
                    <TableCell>{l.prodc || '-'}</TableCell>
                    <TableCell className="text-xs">{l.ubic || '-'}</TableCell>
                    <TableCell>{l.linea || '-'}</TableCell>
                    <TableCell className="text-right">{l.ue ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.length > 50 && (
              <div className="text-center py-2 text-sm text-muted-foreground bg-muted/50">
                ... y {data.length - 50} más
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={reset}>
              Cancelar
            </Button>
            <Button onClick={handleImportClick} disabled={isReadOnly || !inventoryId}>
              <MapPin className="w-4 h-4 mr-2" />
              Importar {data.length} ubicaciones
            </Button>
          </div>
        </>
      )}

      {state === 'importing' && (
        <div className="space-y-4 py-4">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-foreground">Importando ubicaciones PT...</p>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {state === 'success' && (
        <div className="text-center py-8 space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <p className="text-foreground font-medium">Importación completada</p>
          <Button variant="outline" onClick={reset}>
            Importar otro archivo
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Vas a eliminar ubicaciones PT
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este inventario tiene <strong>{existingCounts} conteos</strong> y{' '}
              <strong>{existingValidated} validaciones</strong> guardados. Las ubicaciones con conteos se conservarán,
              pero las demás que no vengan en el archivo se eliminarán de forma permanente.
              <br />
              <br />
              Escribe <strong>BORRAR</strong> para continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="BORRAR"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText.trim().toUpperCase() !== 'BORRAR'}
              onClick={runImport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar y continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PtLocationsImport;
