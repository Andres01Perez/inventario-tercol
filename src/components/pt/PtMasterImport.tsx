import React, { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useInventory } from '@/contexts/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { parsePtMasterExcel, ParsedPtMaster } from '@/lib/ptMasterParser';
import { Upload, Loader2, AlertCircle, AlertTriangle, CheckCircle2, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

type State = 'idle' | 'parsing' | 'preview' | 'importing' | 'success' | 'error';

interface Props {
  currentCount: number;
  onSuccess: () => void;
}

const BATCH = 500;

const PtMasterImport: React.FC<Props> = ({ currentCount, onSuccess }) => {
  const { inventoryId, isReadOnly } = useInventory();
  const { toast } = useToast();
  const [state, setState] = useState<State>('idle');
  const [data, setData] = useState<ParsedPtMaster[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reset = () => {
    setState('idle');
    setData([]);
    setErrors([]);
    setWarnings([]);
    setProgress(0);
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

      const result = await parsePtMasterExcel(file);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setState('error');
        return;
      }
      setWarnings(result.warnings);
      setData(result.data);
      setState('preview');
    },
    [toast]
  );

  const handleImport = async () => {
    if (!inventoryId) return;
    setConfirmOpen(false);
    setState('importing');
    setProgress(0);

    try {
      // Reemplaza la maestra PT del inventario (arrastra ubicaciones y conteos por cascada)
      const { error: delError } = await supabase.from('pt_master').delete().eq('inventory_id', inventoryId);
      if (delError) throw delError;

      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const { error } = await supabase.from('pt_master').insert(
          batch.map((r) => ({
            inventory_id: inventoryId,
            referencia: r.referencia,
            descripcion: r.descripcion,
            cant_erp: r.cant_erp,
          }))
        );
        if (error) throw error;
        setProgress(Math.round(Math.min(i + BATCH, data.length) / data.length * 100));
      }

      setState('success');
      toast({ title: 'Maestra PT importada', description: `${data.length} referencias cargadas` });
      onSuccess();
    } catch (error) {
      console.error('[PT-MASTER-IMPORT]', error);
      setErrors([error instanceof Error ? error.message : 'Error durante la importación']);
      setState('error');
    }
  };

  const totalErp = data.reduce((acc, r) => acc + r.cant_erp, 0);

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
            onClick={() => document.getElementById('pt-master-input')?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">
              {currentCount > 0 ? 'Arrastra el archivo para reemplazar la maestra PT' : 'Arrastra el archivo de la maestra PT'}
            </p>
            <p className="text-sm text-muted-foreground">o haz clic para seleccionar</p>
            <input
              id="pt-master-input"
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

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium text-foreground mb-2">Columnas esperadas:</p>
            <div className="flex gap-2 flex-wrap text-muted-foreground">
              <code className="bg-background px-2 py-1 rounded text-xs">CODIGO*</code>
              <code className="bg-background px-2 py-1 rounded text-xs">DESCRIPCION</code>
              <code className="bg-background px-2 py-1 rounded text-xs">CANT.*</code>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              * Obligatoria. <strong>CANT.</strong> es el saldo ERP real y total de la referencia.
            </p>
          </div>
        </>
      )}

      {state === 'parsing' && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">Procesando archivo...</p>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive mb-2">Errores encontrados:</p>
                <ul className="text-sm text-destructive/80 space-y-1 max-h-48 overflow-y-auto">
                  {errors.slice(0, 30).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                  {errors.length > 30 && <li>... y {errors.length - 30} más</li>}
                </ul>
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

          <div className="flex gap-3 flex-wrap">
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
              {data.length} referencias
            </Badge>
            <Badge variant="outline">Total ERP: {totalErp.toLocaleString('es-CO')}</Badge>
            {currentCount > 0 && (
              <Badge variant="destructive">Reemplaza {currentCount} referencias existentes</Badge>
            )}
          </div>

          <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cant. ERP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 50).map((r) => (
                  <TableRow key={r.referencia}>
                    <TableCell className="font-mono text-xs">{r.referencia}</TableCell>
                    <TableCell className="text-sm">{r.descripcion || '-'}</TableCell>
                    <TableCell className="text-right">{r.cant_erp.toLocaleString('es-CO')}</TableCell>
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
            <Button onClick={() => setConfirmOpen(true)} disabled={isReadOnly || !inventoryId}>
              <PackageCheck className="w-4 h-4 mr-2" />
              Importar {data.length} referencias
            </Button>
          </div>
        </>
      )}

      {state === 'importing' && (
        <div className="space-y-4 py-4">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-foreground">Importando maestra PT...</p>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {state === 'success' && (
        <div className="text-center py-8 space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <p className="text-foreground font-medium">{data.length} referencias PT importadas</p>
          <Button variant="outline" onClick={reset}>
            Importar otro archivo
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar la maestra de Producto Terminado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán las {currentCount} referencias PT del inventario actual junto con sus ubicaciones y
              conteos, y se cargarán las {data.length} del archivo. Los inventarios históricos y las familias MP/PP
              no se tocan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport}>Reemplazar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PtMasterImport;
