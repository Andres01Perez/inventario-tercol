import React, { useState, useCallback } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  Trash2,
  Package,
  Factory
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  parseExcelFile, 
  validateCombinedData, 
  ParsedRow,
  ParseResult,
  ValidationResult,
  MaterialType
} from '@/lib/masterDataParser';

type ImportState = 'idle' | 'parsing' | 'preview' | 'importing' | 'success' | 'error';

interface FileUploadZoneProps {
  type: MaterialType;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled: boolean;
  parseResult: ParseResult | null;
}

const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  type,
  file,
  onFileSelect,
  disabled,
  parseResult,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && isValidFile(droppedFile)) {
        onFileSelect(droppedFile);
      }
    },
    [disabled, onFileSelect]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && isValidFile(selectedFile)) {
      onFileSelect(selectedFile);
    }
  };

  const isValidFile = (file: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    return (
      validTypes.includes(file.type) ||
      validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
  };

  const isMP = type === 'MP';
  const bgColor = isMP ? 'bg-blue-500/5' : 'bg-emerald-500/5';
  const borderColor = isMP 
    ? isDragging ? 'border-blue-500' : 'border-blue-500/30' 
    : isDragging ? 'border-emerald-500' : 'border-emerald-500/30';
  const iconColor = isMP ? 'text-blue-500' : 'text-emerald-500';
  const Icon = isMP ? Package : Factory;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative rounded-xl border-2 border-dashed p-6 transition-all
        ${bgColor} ${borderColor}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-opacity-60'}
        ${isDragging ? 'scale-[1.02]' : ''}
      `}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileInput}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />

      <div className="flex flex-col items-center text-center">
        <div className={`p-4 rounded-full ${isMP ? 'bg-blue-500/10' : 'bg-emerald-500/10'} mb-4`}>
          <Icon className={`w-8 h-8 ${iconColor}`} />
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-1">
          {isMP ? 'Materia Prima (MP)' : 'Producto Proceso (PP)'}
        </h3>

        {file ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">{file.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(null);
                }}
                disabled={disabled}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {parseResult && (
              <div className="text-sm">
                {parseResult.errors.length > 0 ? (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    <span>{parseResult.errors[0]}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{parseResult.data.length} referencias cargadas</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              Arrastra un archivo aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-muted-foreground">
              Formatos: .xlsx, .xls, .csv
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const MasterDataImport: React.FC = () => {
  const { toast } = useToast();
  
  const [state, setState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState(0);
  
  const [mpFile, setMpFile] = useState<File | null>(null);
  const [ppFile, setPpFile] = useState<File | null>(null);
  
  const [mpResult, setMpResult] = useState<ParseResult | null>(null);
  const [ppResult, setPpResult] = useState<ParseResult | null>(null);
  
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [combinedData, setCombinedData] = useState<ParsedRow[]>([]);

  const handleMpFileSelect = async (file: File | null) => {
    setMpFile(file);
    setMpResult(null);
    setValidation(null);
    setCombinedData([]);
    setState('idle');

    if (file) {
      setState('parsing');
      const result = await parseExcelFile(file, 'MP');
      setMpResult(result);
      
      // If PP is also loaded, validate both
      if (ppResult && ppResult.data.length > 0) {
        const validationResult = validateCombinedData(result.data, ppResult.data);
        setValidation(validationResult);
        setCombinedData([...result.data, ...ppResult.data]);
        setState('preview');
      } else if (result.data.length > 0) {
        setValidation(validateCombinedData(result.data, []));
        setCombinedData(result.data);
        setState('preview');
      } else {
        setState('idle');
      }
    }
  };

  const handlePpFileSelect = async (file: File | null) => {
    setPpFile(file);
    setPpResult(null);
    setValidation(null);
    setCombinedData([]);
    setState('idle');

    if (file) {
      setState('parsing');
      const result = await parseExcelFile(file, 'PP');
      setPpResult(result);
      
      // If MP is also loaded, validate both
      if (mpResult && mpResult.data.length > 0) {
        const validationResult = validateCombinedData(mpResult.data, result.data);
        setValidation(validationResult);
        setCombinedData([...mpResult.data, ...result.data]);
        setState('preview');
      } else if (result.data.length > 0) {
        setValidation(validateCombinedData([], result.data));
        setCombinedData(result.data);
        setState('preview');
      } else {
        setState('idle');
      }
    }
  };

  const handleImport = async () => {
    if (combinedData.length === 0) return;

    setState('importing');
    setProgress(0);

    try {
      // Step 1: Delete all existing records
      setProgress(10);
      const { error: deleteError } = await supabase
        .from('inventory_master')
        .delete()
        .neq('reference', '');

      if (deleteError) {
        throw new Error(`Error al eliminar datos existentes: ${deleteError.message}`);
      }

      // Step 2: Insert in batches of 500
      const BATCH_SIZE = 500;
      const batches = [];
      for (let i = 0; i < combinedData.length; i += BATCH_SIZE) {
        batches.push(combinedData.slice(i, i + BATCH_SIZE));
      }

      const progressPerBatch = 80 / batches.length;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const { error: insertError } = await supabase
          .from('inventory_master')
          .insert(batch);

        if (insertError) {
          throw new Error(`Error al insertar lote ${i + 1}: ${insertError.message}`);
        }

        setProgress(10 + (i + 1) * progressPerBatch);
      }

      setProgress(100);
      setState('success');

      toast({
        title: 'Importación exitosa',
        description: `Se importaron ${combinedData.length} referencias correctamente`,
      });

      // Reset after success
      setTimeout(() => {
        setMpFile(null);
        setPpFile(null);
        setMpResult(null);
        setPpResult(null);
        setValidation(null);
        setCombinedData([]);
        setState('idle');
        setProgress(0);
      }, 2000);
    } catch (error) {
      setState('error');
      toast({
        title: 'Error en la importación',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const handleClear = () => {
    setMpFile(null);
    setPpFile(null);
    setMpResult(null);
    setPpResult(null);
    setValidation(null);
    setCombinedData([]);
    setState('idle');
    setProgress(0);
  };

  const mpCount = mpResult?.data.length || 0;
  const ppCount = ppResult?.data.length || 0;
  const totalCount = mpCount + ppCount;

  const allWarnings = [
    ...(mpResult?.warnings || []),
    ...(ppResult?.warnings || []),
    ...(validation?.warnings || []),
  ];

  const canImport = 
    combinedData.length > 0 && 
    validation?.isValid && 
    state === 'preview';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Importar Maestra</h2>
          <p className="text-muted-foreground">
            Carga los archivos de Materia Prima y Producto Proceso
          </p>
        </div>
        {(mpFile || ppFile) && state !== 'importing' && (
          <Button variant="outline" onClick={handleClear}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Upload Zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileUploadZone
          type="MP"
          file={mpFile}
          onFileSelect={handleMpFileSelect}
          disabled={state === 'importing'}
          parseResult={mpResult}
        />
        <FileUploadZone
          type="PP"
          file={ppFile}
          onFileSelect={handlePpFileSelect}
          disabled={state === 'importing'}
          parseResult={ppResult}
        />
      </div>

      {/* Warnings */}
      {allWarnings.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-amber-700 dark:text-amber-400">Advertencias</p>
              {allWarnings.map((warning, idx) => (
                <p key={idx} className="text-sm text-amber-600 dark:text-amber-300">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {validation && !validation.isValid && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-destructive">Errores de validación</p>
              {validation.errors.map((error, idx) => (
                <p key={idx} className="text-sm text-destructive/80">
                  {error}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {combinedData.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                {mpCount} MP
              </Badge>
              <span className="text-muted-foreground">+</span>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                {ppCount} PP
              </Badge>
              <span className="text-muted-foreground">=</span>
              <Badge variant="default">
                {totalCount} Total
              </Badge>
            </div>
          </div>

          {/* Preview Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="max-h-80 overflow-x-auto overflow-y-auto">
              <Table className="min-w-[800px]">
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="min-w-[180px] font-mono text-xs bg-muted/50">reference</TableHead>
                    <TableHead className="min-w-[100px] font-mono text-xs bg-muted/50">material_type</TableHead>
                    <TableHead className="min-w-[90px] text-right font-mono text-xs bg-muted/50">erp_alm</TableHead>
                    <TableHead className="min-w-[90px] text-right font-mono text-xs bg-muted/50">erp_pld</TableHead>
                    <TableHead className="min-w-[90px] text-right font-mono text-xs bg-muted/50">erp_plr</TableHead>
                    <TableHead className="min-w-[90px] text-right font-mono text-xs bg-muted/50">erp_za</TableHead>
                    <TableHead className="min-w-[110px] text-right font-mono text-xs bg-muted/50">erp_target_qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinedData.slice(0, 100).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{row.reference}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={row.material_type === 'MP' 
                            ? 'border-blue-500/50 text-blue-600' 
                            : 'border-emerald-500/50 text-emerald-600'
                          }
                        >
                          {row.material_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.erp_alm.toLocaleString('es-CO')}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.erp_pld.toLocaleString('es-CO')}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.erp_plr.toLocaleString('es-CO')}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.erp_za.toLocaleString('es-CO')}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{row.erp_target_qty.toLocaleString('es-CO')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {combinedData.length > 100 && (
              <div className="p-3 text-center text-sm text-muted-foreground bg-muted/30 border-t">
                Mostrando 100 de {combinedData.length} referencias
              </div>
            )}
          </div>

          {/* Import Progress */}
          {state === 'importing' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Importando...</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Success Message */}
          {state === 'success' && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Importación completada exitosamente</span>
              </div>
            </div>
          )}

          {/* Import Button */}
          <div className="flex justify-end">
            <Button 
              size="lg"
              onClick={handleImport}
              disabled={!canImport}
              className="min-w-40"
            >
              {state === 'importing' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Importar {totalCount} referencias
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {combinedData.length === 0 && state === 'idle' && (
        <div className="text-center py-8 text-muted-foreground">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Selecciona al menos un archivo para comenzar</p>
        </div>
      )}

      {/* Parsing State */}
      {state === 'parsing' && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Procesando archivo...</p>
        </div>
      )}
    </div>
  );
};

export default MasterDataImport;
