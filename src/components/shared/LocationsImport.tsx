import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  parseLocationsExcel, 
  generateLocationsTemplate,
  ParsedLocation 
} from '@/lib/locationsParser';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MapPin,
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

interface LocationWithStatus extends ParsedLocation {
  status: 'valid' | 'invalid_reference' | 'duplicate';
  existingLocationId?: string;
}

interface LocationsImportProps {
  onSuccess: () => void;
  onClose: () => void;
}

type ImportState = 'idle' | 'parsing' | 'validating' | 'preview' | 'importing' | 'success' | 'error';

const LocationsImport: React.FC<LocationsImportProps> = ({ onSuccess, onClose }) => {
  const [state, setState] = useState<ImportState>('idle');
  const [parsedData, setParsedData] = useState<LocationWithStatus[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importStats, setImportStats] = useState({ created: 0, updated: 0, skipped: 0 });
  const { toast } = useToast();
  const { profile } = useAuth();

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
      const result = await parseLocationsExcel(file);
      
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setState('error');
        return;
      }

      setWarnings(result.warnings);
      setState('validating');

      // Validate references against inventory_master
      const uniqueRefs = [...new Set(result.data.map(loc => loc.master_reference))];
      
      const { data: existingRefs, error: refsError } = await supabase
        .from('inventory_master')
        .select('referencia')
        .in('referencia', uniqueRefs);

      if (refsError) throw refsError;

      const validRefsSet = new Set((existingRefs || []).map(r => r.referencia));

      // Check for existing locations in database (for duplicate detection: referencia + ubicación detallada + punto referencia)
      // Solo buscar duplicados para el admin actual
      let existingLocationsQuery = supabase
        .from('locations')
        .select('id, master_reference, location_detail, punto_referencia')
        .in('master_reference', uniqueRefs);
      
      if (profile?.id) {
        existingLocationsQuery = existingLocationsQuery.eq('assigned_admin_id', profile.id);
      }
      
      const { data: existingLocations } = await existingLocationsQuery;

      const existingLocationsMap = new Map<string, string>();
      existingLocations?.forEach(loc => {
        const key = `${loc.master_reference.toLowerCase()}|${(loc.location_detail || '').toLowerCase()}|${(loc.punto_referencia || '').toLowerCase()}`;
        existingLocationsMap.set(key, loc.id);
      });

      // Build data with status
      const dataWithStatus: LocationWithStatus[] = result.data.map(loc => {
        const refIsValid = validRefsSet.has(loc.master_reference);
        const locKey = `${loc.master_reference.toLowerCase()}|${(loc.location_detail || '').toLowerCase()}|${(loc.punto_referencia || '').toLowerCase()}`;
        const existingId = existingLocationsMap.get(locKey);

        let status: 'valid' | 'invalid_reference' | 'duplicate';
        if (!refIsValid) {
          status = 'invalid_reference';
        } else if (existingId) {
          status = 'duplicate';
        } else {
          status = 'valid';
        }

        return {
          ...loc,
          status,
          existingLocationId: existingId,
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

    const toCreate = parsedData.filter(loc => loc.status === 'valid');
    const toUpdate = updateExisting ? parsedData.filter(loc => loc.status === 'duplicate') : [];
    const total = toCreate.length + toUpdate.length;
    
    if (total === 0) {
      setErrors(['No hay ubicaciones válidas para importar']);
      setState('error');
      return;
    }

    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = parsedData.filter(loc => 
      loc.status === 'invalid_reference' || (loc.status === 'duplicate' && !updateExisting)
    ).length;

    try {
      // Insert new locations in batches of 500 (Supabase handles up to 1000)
      const insertBatchSize = 500;
      for (let i = 0; i < toCreate.length; i += insertBatchSize) {
        const batch = toCreate.slice(i, i + insertBatchSize);
        const { error } = await supabase
          .from('locations')
          .insert(batch.map(loc => ({
            master_reference: loc.master_reference,
            subcategoria: loc.subcategoria,
            observaciones: loc.observaciones,
            location_name: loc.location_name,
            location_detail: loc.location_detail,
            punto_referencia: loc.punto_referencia,
            metodo_conteo: loc.metodo_conteo,
            assigned_admin_id: profile?.id,
          })));

        if (error) throw error;
        
        created += batch.length;
        processed += batch.length;
        setProgress(Math.round((processed / total) * 100));
      }

      // Update existing locations in parallel batches
      const updateBatchSize = 100;
      for (let i = 0; i < toUpdate.length; i += updateBatchSize) {
        const batch = toUpdate.slice(i, i + updateBatchSize);
        
        // Execute updates in parallel within each batch
        const updatePromises = batch
          .filter(loc => loc.existingLocationId)
          .map(loc => 
            supabase
              .from('locations')
              .update({
                subcategoria: loc.subcategoria,
                observaciones: loc.observaciones,
                location_detail: loc.location_detail,
                punto_referencia: loc.punto_referencia,
                metodo_conteo: loc.metodo_conteo,
              })
              .eq('id', loc.existingLocationId!)
          );
        
        const results = await Promise.all(updatePromises);
        
        // Check for errors
        const failedUpdate = results.find(r => r.error);
        if (failedUpdate?.error) throw failedUpdate.error;
        
        updated += batch.filter(loc => loc.existingLocationId).length;
        processed += batch.length;
        setProgress(Math.round((processed / total) * 100));
      }

      setImportStats({ created, updated, skipped });
      setState('success');
      
      toast({
        title: 'Importación exitosa',
        description: `${created} creadas, ${updated} actualizadas, ${skipped} omitidas`,
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

  const validCount = parsedData.filter(loc => loc.status === 'valid').length;
  const invalidRefCount = parsedData.filter(loc => loc.status === 'invalid_reference').length;
  const duplicateCount = parsedData.filter(loc => loc.status === 'duplicate').length;

  return (
    <div className="space-y-4">
      {/* Estado: Idle - Zona de drop */}
      {state === 'idle' && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
            onClick={() => document.getElementById('locations-file-input')?.click()}
          >
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">
              Arrastra un archivo Excel aquí
            </p>
            <p className="text-sm text-muted-foreground">
              o haz clic para seleccionar
            </p>
            <input
              id="locations-file-input"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          <div className="flex justify-center">
            <Button variant="outline" onClick={generateLocationsTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium text-foreground mb-2">Columnas esperadas:</p>
            <div className="flex gap-2 flex-wrap text-muted-foreground">
              <code className="bg-background px-2 py-1 rounded text-xs">Referencia*</code>
              <code className="bg-background px-2 py-1 rounded text-xs">Subcategoría</code>
              <code className="bg-background px-2 py-1 rounded text-xs">Observaciones</code>
              <code className="bg-background px-2 py-1 rounded text-xs">Ubicación</code>
              <code className="bg-background px-2 py-1 rounded text-xs">Ubicación Detallada</code>
              <code className="bg-background px-2 py-1 rounded text-xs">Punto Referencia</code>
              <code className="bg-background px-2 py-1 rounded text-xs">Método Conteo</code>
            </div>
            <p className="text-xs text-muted-foreground mt-2">* Campo obligatorio. Una referencia puede tener múltiples ubicaciones.</p>
          </div>
        </>
      )}

      {/* Estado: Parsing / Validating */}
      {(state === 'parsing' || state === 'validating') && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">
            {state === 'parsing' ? 'Procesando archivo...' : 'Validando referencias...'}
          </p>
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
          <div className="flex gap-3 flex-wrap">
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              {validCount} válidas
            </Badge>
            {invalidRefCount > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                {invalidRefCount} referencia inválida
              </Badge>
            )}
            {duplicateCount > 0 && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                {duplicateCount} duplicadas
              </Badge>
            )}
          </div>

          {/* Opción para actualizar existentes */}
          {duplicateCount > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="update-existing-locations"
                checked={updateExisting}
                onCheckedChange={(checked) => setUpdateExisting(checked === true)}
              />
              <Label htmlFor="update-existing-locations" className="text-sm cursor-pointer">
                Actualizar ubicaciones existentes (misma referencia + ubicación detallada + punto referencia)
              </Label>
            </div>
          )}

          {/* Tabla de preview */}
          <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Subcategoría</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.slice(0, 50).map((loc, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{loc.master_reference}</TableCell>
                    <TableCell>{loc.location_name || '-'}</TableCell>
                    <TableCell>{loc.subcategoria || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          loc.status === 'valid'
                            ? 'bg-green-500/10 text-green-500 border-green-500/30'
                            : loc.status === 'duplicate'
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                            : 'bg-red-500/10 text-red-500 border-red-500/30'
                        }
                      >
                        {loc.status === 'valid' 
                          ? 'Válida' 
                          : loc.status === 'duplicate' 
                          ? 'Existente' 
                          : 'Ref. no existe'}
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
            <Button onClick={handleImport} disabled={validCount === 0 && !updateExisting}>
              <MapPin className="w-4 h-4 mr-2" />
              Importar {validCount + (updateExisting ? duplicateCount : 0)} ubicaciones
            </Button>
          </div>
        </>
      )}

      {/* Estado: Importing */}
      {state === 'importing' && (
        <div className="space-y-4 py-4">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-foreground font-medium">Importando ubicaciones...</p>
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
                  {importStats.created} creadas
                </Badge>
              )}
              {importStats.updated > 0 && (
                <Badge className="bg-blue-500">
                  {importStats.updated} actualizadas
                </Badge>
              )}
              {importStats.skipped > 0 && (
                <Badge variant="outline">
                  {importStats.skipped} omitidas
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

export default LocationsImport;
