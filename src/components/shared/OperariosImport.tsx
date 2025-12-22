import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  parseOperariosExcel, 
  generateOperariosTemplate,
  ParsedOperario 
} from '@/lib/operariosParser';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface OperarioWithStatus extends ParsedOperario {
  status: 'new' | 'existing' | 'duplicate';
  existingId?: string;
}

interface OperariosImportProps {
  onSuccess: () => void;
  onClose: () => void;
}

type ImportState = 'idle' | 'parsing' | 'preview' | 'importing' | 'success' | 'error';

const OperariosImport: React.FC<OperariosImportProps> = ({ onSuccess, onClose }) => {
  const [state, setState] = useState<ImportState>('idle');
  const [parsedData, setParsedData] = useState<OperarioWithStatus[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importStats, setImportStats] = useState({ created: 0, updated: 0, skipped: 0 });
  const { toast } = useToast();

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: 'Archivo inválido',
        description: 'Solo se permiten archivos Excel (.xlsx, .xls)',
        variant: 'destructive',
      });
      return;
    }

    setState('parsing');
    setErrors([]);
    setWarnings([]);

    try {
      const result = await parseOperariosExcel(file);
      
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setState('error');
        return;
      }

      setWarnings(result.warnings);

      // Check against existing operarios in database
      const { data: existingOperarios } = await supabase
        .from('operarios')
        .select('id, full_name');

      const existingMap = new Map(
        (existingOperarios || []).map(op => [op.full_name.toLowerCase(), op.id])
      );

      const dataWithStatus: OperarioWithStatus[] = result.data.map(op => {
        const existingId = existingMap.get(op.full_name.toLowerCase());
        return {
          ...op,
          status: existingId ? 'existing' : 'new',
          existingId,
        };
      });

      setParsedData(dataWithStatus);
      setState('preview');
    } catch (error) {
      console.error('Error processing file:', error);
      setErrors(['Error al procesar el archivo']);
      setState('error');
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = async () => {
    setState('importing');
    setProgress(0);

    const toCreate = parsedData.filter(op => op.status === 'new');
    const toUpdate = updateExisting ? parsedData.filter(op => op.status === 'existing') : [];
    const total = toCreate.length + toUpdate.length;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = parsedData.filter(op => op.status === 'existing' && !updateExisting).length;

    try {
      // Insert new operarios in batches
      const batchSize = 50;
      for (let i = 0; i < toCreate.length; i += batchSize) {
        const batch = toCreate.slice(i, i + batchSize);
        const { error } = await supabase
          .from('operarios')
          .insert(batch.map(op => ({
            full_name: op.full_name,
            turno: op.turno,
          })));

        if (error) throw error;
        
        created += batch.length;
        processed += batch.length;
        setProgress(Math.round((processed / total) * 100));
      }

      // Update existing operarios
      for (const op of toUpdate) {
        if (op.existingId) {
          const { error } = await supabase
            .from('operarios')
            .update({ turno: op.turno })
            .eq('id', op.existingId);

          if (error) throw error;
          
          updated++;
          processed++;
          setProgress(Math.round((processed / total) * 100));
        }
      }

      setImportStats({ created, updated, skipped });
      setState('success');
      
      toast({
        title: 'Importación exitosa',
        description: `${created} creados, ${updated} actualizados, ${skipped} omitidos`,
      });

      onSuccess();
    } catch (error) {
      console.error('Error importing:', error);
      setErrors(['Error durante la importación']);
      setState('error');
    }
  };

  const resetState = () => {
    setState('idle');
    setParsedData([]);
    setErrors([]);
    setWarnings([]);
    setProgress(0);
  };

  const newCount = parsedData.filter(op => op.status === 'new').length;
  const existingCount = parsedData.filter(op => op.status === 'existing').length;

  return (
    <div className="space-y-4">
      {/* Estado: Idle - Zona de drop */}
      {state === 'idle' && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">
              Arrastra un archivo Excel aquí
            </p>
            <p className="text-sm text-muted-foreground">
              o haz clic para seleccionar
            </p>
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          <div className="flex justify-center">
            <Button variant="outline" onClick={generateOperariosTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium text-foreground mb-2">Formato esperado:</p>
            <div className="flex gap-4 text-muted-foreground">
              <code className="bg-background px-2 py-1 rounded">nombre</code>
              <code className="bg-background px-2 py-1 rounded">turno (1 o 2)</code>
            </div>
          </div>
        </>
      )}

      {/* Estado: Parsing */}
      {state === 'parsing' && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">Procesando archivo...</p>
        </div>
      )}

      {/* Estado: Error */}
      {state === 'error' && (
        <div className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive mb-2">Errores encontrados:</p>
                <ul className="text-sm text-destructive/80 space-y-1">
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={resetState} className="w-full">
            Intentar de nuevo
          </Button>
        </div>
      )}

      {/* Estado: Preview */}
      {state === 'preview' && (
        <>
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">
                    Advertencias:
                  </p>
                  <ul className="text-yellow-600/80 dark:text-yellow-400/80 space-y-0.5">
                    {warnings.slice(0, 5).map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                    {warnings.length > 5 && (
                      <li>... y {warnings.length - 5} más</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Resumen */}
          <div className="flex gap-4 flex-wrap">
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              {newCount} nuevos
            </Badge>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
              {existingCount} existentes
            </Badge>
          </div>

          {/* Opción para actualizar existentes */}
          {existingCount > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="update-existing"
                checked={updateExisting}
                onCheckedChange={(checked) => setUpdateExisting(checked === true)}
              />
              <Label htmlFor="update-existing" className="text-sm cursor-pointer">
                Actualizar turno de operarios existentes
              </Label>
            </div>
          )}

          {/* Tabla de preview */}
          <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.slice(0, 50).map((op, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{op.full_name}</TableCell>
                    <TableCell>T{op.turno}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          op.status === 'new'
                            ? 'bg-green-500/10 text-green-500 border-green-500/30'
                            : 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                        }
                      >
                        {op.status === 'new' ? 'Nuevo' : 'Existente'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsedData.length > 50 && (
              <div className="text-center py-2 text-sm text-muted-foreground bg-muted/50">
                ... y {parsedData.length - 50} más
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={resetState}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={newCount === 0 && !updateExisting}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Importar {newCount + (updateExisting ? existingCount : 0)} operarios
            </Button>
          </div>
        </>
      )}

      {/* Estado: Importing */}
      {state === 'importing' && (
        <div className="space-y-4 py-4">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-foreground font-medium">Importando operarios...</p>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-center text-sm text-muted-foreground">{progress}%</p>
        </div>
      )}

      {/* Estado: Success */}
      {state === 'success' && (
        <div className="text-center py-6 space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
          <div>
            <p className="text-lg font-medium text-foreground mb-2">
              ¡Importación completada!
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              {importStats.created > 0 && (
                <Badge className="bg-green-500">
                  {importStats.created} creados
                </Badge>
              )}
              {importStats.updated > 0 && (
                <Badge className="bg-blue-500">
                  {importStats.updated} actualizados
                </Badge>
              )}
              {importStats.skipped > 0 && (
                <Badge variant="outline">
                  {importStats.skipped} omitidos
                </Badge>
              )}
            </div>
          </div>
          <Button onClick={onClose}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
};

export default OperariosImport;
