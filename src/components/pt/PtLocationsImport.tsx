import React, { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { parsePtLocationsExcel, generatePtLocationsTemplate, ParsedPtLocation } from '@/lib/ptLocationsParser';
import { Upload, Download, Loader2, AlertCircle, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
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

const BATCH = 500;

const PtLocationsImport: React.FC<Props> = ({ onSuccess }) => {
  const { inventoryId, isReadOnly } = useInventory();
  const { toast } = useToast();
  const [state, setState] = useState<State>('idle');
  const [data, setData] = useState<ParsedPtLocation[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [invalidRefs, setInvalidRefs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [replaceAll, setReplaceAll] = useState(true);

  const reset = () => {
    setState('idle');
    setData([]);
    setErrors([]);
    setWarnings([]);
    setInvalidRefs([]);
    setProgress(0);
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

  const handleImport = async () => {
    if (!inventoryId) return;
    setState('importing');
    setProgress(0);

    try {
      if (replaceAll) {
        const { error } = await supabase.from('pt_locations').delete().eq('inventory_id', inventoryId);
        if (error) throw error;
      }

      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
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
        setProgress(Math.round((Math.min(i + BATCH, data.length) / data.length) * 100));
      }

      // Aplica las asignaciones de piso ya configuradas a las ubicaciones nuevas
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
          .eq('piso', a.piso);
      }

      setState('success');
      toast({ title: 'Ubicaciones PT importadas', description: `${data.length} ubicaciones cargadas` });
      onSuccess();
    } catch (error) {
      console.error('[PT-LOCATIONS-IMPORT]', error);
      setErrors([error instanceof Error ? error.message : 'Error durante la importación']);
      setState('error');
    }
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
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={replaceAll} onCheckedChange={(v) => setReplaceAll(!!v)} />
            Reemplazar todas las ubicaciones PT existentes de este inventario
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
            <Button onClick={handleImport} disabled={isReadOnly || !inventoryId}>
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
          <p className="text-foreground font-medium">{data.length} ubicaciones PT importadas</p>
          <Button variant="outline" onClick={reset}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
};

export default PtLocationsImport;
