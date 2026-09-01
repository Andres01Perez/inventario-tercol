import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  Trash2,
  Package,
  Factory,
  Boxes,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useInventory } from '@/contexts/InventoryContext';
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

type ImportState = 'idle' | 'parsing' | 'preview' | 'importing' | 'success' | 'error' | 'checking';

interface ActiveInventoryCheck {
  hasLocations: boolean;
  locationsCount: number;
  hasAssignedSupervisors: boolean;
  assignedCount: number;
  hasNonPendingStatus: boolean;
  nonPendingCount: number;
  hasCountHistory: boolean;
  countHistoryCount: number;
  isActive: boolean;
}

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

  const typeConfig = {
    MP: { bg: 'bg-blue-500/5', border: 'border-blue-500/30', borderActive: 'border-blue-500', iconBg: 'bg-blue-500/10', icon: 'text-blue-500', Icon: Package, title: 'Materia Prima (MP)' },
    PP: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/30', borderActive: 'border-emerald-500', iconBg: 'bg-emerald-500/10', icon: 'text-emerald-500', Icon: Factory, title: 'Producto Proceso (PP)' },
    PT: { bg: 'bg-amber-500/5', border: 'border-amber-500/30', borderActive: 'border-amber-500', iconBg: 'bg-amber-500/10', icon: 'text-amber-500', Icon: Boxes, title: 'Producto Terminado (PT)' },
  } as const;
  const cfg = typeConfig[type];
  const bgColor = cfg.bg;
  const borderColor = isDragging ? cfg.borderActive : cfg.border;
  const iconColor = cfg.icon;
  const Icon = cfg.Icon;

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
        <div className={`p-4 rounded-full ${cfg.iconBg} mb-4`}>
          <Icon className={`w-8 h-8 ${iconColor}`} />
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-1">
          {cfg.title}
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

interface FamilyReplaceButtonProps {
  type: MaterialType;
  count: number;
  isSelected: boolean;
  hasFile: boolean;
  fileName?: string;
  onSelect: () => void;
  onClear: () => void;
  disabled: boolean;
}

const FamilyReplaceButton: React.FC<FamilyReplaceButtonProps> = ({
  type,
  count,
  isSelected,
  hasFile,
  fileName,
  onSelect,
  onClear,
  disabled,
}) => {
  const cfg = {
    MP: { bg: 'bg-blue-500/5', border: 'border-blue-500/30', borderActive: 'border-blue-500', iconBg: 'bg-blue-500/10', icon: 'text-blue-500', Icon: Package, title: 'Materia Prima (MP)' },
    PP: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/30', borderActive: 'border-emerald-500', iconBg: 'bg-emerald-500/10', icon: 'text-emerald-500', Icon: Factory, title: 'Producto Proceso (PP)' },
    PT: { bg: 'bg-amber-500/5', border: 'border-amber-500/30', borderActive: 'border-amber-500', iconBg: 'bg-amber-500/10', icon: 'text-amber-500', Icon: Boxes, title: 'Producto Terminado (PT)' },
  } as const;
  const c = cfg[type];
  const Icon = c.Icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`
        relative flex flex-col items-center text-center rounded-xl border-2 p-6 transition-all
        ${c.bg} ${isSelected ? c.borderActive : c.border}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01] hover:border-opacity-60 cursor-pointer'}
        ${isSelected ? 'ring-1 ring-offset-1 ring-offset-background' : ''}
      `}
    >
      <div className={`p-4 rounded-full ${c.iconBg} mb-4`}>
        <Icon className={`w-8 h-8 ${c.icon}`} />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{c.title}</h3>
      <p className="text-sm text-muted-foreground mb-3">
        {count} referencia{count !== 1 ? 's' : ''} cargada{count !== 1 ? 's' : ''}
      </p>

      {hasFile && fileName ? (
        <div className="flex items-center gap-2 text-sm">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium truncate max-w-[180px]">{fileName}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Upload className="w-4 h-4" />
          Reemplazar {type}
        </span>
      )}
    </button>
  );
};

// Helper to format number or show dash for null
const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('es-CO');
};

const MasterDataImport: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { inventoryId, inventory, isReadOnly, refetchInventories, setSelectedInventoryId } = useInventory();

  // Modo de importación: reemplazar dentro del inventario abierto o crear uno nuevo
  const [importMode, setImportMode] = useState<'replace' | 'new'>('replace');
  const [newInventoryName, setNewInventoryName] = useState('');
  const [newInventoryDate, setNewInventoryDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Familia seleccionada para reemplazar y conteos actuales del inventario abierto
  const [selectedFamily, setSelectedFamily] = useState<MaterialType | null>(null);
  const [familyCounts, setFamilyCounts] = useState<{ MP: number; PP: number; PT: number }>({ MP: 0, PP: 0, PT: 0 });
  const [familyCountsLoading, setFamilyCountsLoading] = useState(false);

  const hasOpenInventory = !!inventoryId && inventory?.status === 'abierto' && !isReadOnly;

  const [state, setState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState(0);
  
  const [mpFile, setMpFile] = useState<File | null>(null);
  const [ppFile, setPpFile] = useState<File | null>(null);

  const [mpResult, setMpResult] = useState<ParseResult | null>(null);
  const [ppResult, setPpResult] = useState<ParseResult | null>(null);
  
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [combinedData, setCombinedData] = useState<ParsedRow[]>([]);
  
  // Active inventory protection states
  const [activeCheck, setActiveCheck] = useState<ActiveInventoryCheck | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Cargar conteos actuales por familia del inventario abierto
  useEffect(() => {
    if (!hasOpenInventory || !inventoryId) {
      setFamilyCounts({ MP: 0, PP: 0, PT: 0 });
      return;
    }

    let cancelled = false;
    const fetchCounts = async () => {
      setFamilyCountsLoading(true);
      try {
        const families: Array<'MP' | 'PP'> = ['MP', 'PP'];
        const results = await Promise.all([
          ...families.map((family) =>
            supabase
              .from('inventory_master')
              .select('*', { count: 'exact', head: true })
              .eq('inventory_id', inventoryId)
              .eq('material_type', family)
          ),
          // PT vive en su propia tabla (pt_master), fuera de inventory_master
          supabase
            .from('pt_master')
            .select('*', { count: 'exact', head: true })
            .eq('inventory_id', inventoryId),
        ]);

        const counts = { MP: 0, PP: 0, PT: 0 };
        results.forEach((res, i) => {
          if (res.error) throw res.error;
          if (i < 2) counts[families[i]] = res.count ?? 0;
          else counts.PT = res.count ?? 0;
        });

        if (!cancelled) setFamilyCounts(counts);
      } catch (err) {
        console.error('Error cargando conteos por familia:', err);
      } finally {
        if (!cancelled) setFamilyCountsLoading(false);
      }
    };

    fetchCounts();
    return () => { cancelled = true; };
  }, [inventoryId, hasOpenInventory, importMode]);

  // Al cambiar a modo nuevo inventario se oculta la selección de familia
  useEffect(() => {
    if (importMode === 'new') {
      setSelectedFamily(null);
    }
  }, [importMode]);

  const checkActiveInventory = async (): Promise<ActiveInventoryCheck> => {
    // Check locations count
    const { count: locationsCount } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('inventory_id', inventoryId!);

    // Check assigned supervisors
    const { count: assignedCount } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('inventory_id', inventoryId!)
      .not('assigned_supervisor_id', 'is', null);

    // Check non-pending status
    const { count: nonPendingCount } = await supabase
      .from('inventory_master')
      .select('*', { count: 'exact', head: true })
      .eq('inventory_id', inventoryId!)
      .neq('status_slug', 'pendiente');

    // Check count history (not empty array)
    const { data: historyData } = await supabase
      .from('inventory_master')
      .select('count_history')
      .eq('inventory_id', inventoryId!)
      .neq('count_history', '[]');

    const countHistoryCount = historyData?.length || 0;

    const hasLocations = (locationsCount || 0) > 0;
    const hasAssignedSupervisors = (assignedCount || 0) > 0;
    const hasNonPendingStatus = (nonPendingCount || 0) > 0;
    const hasCountHistory = countHistoryCount > 0;

    return {
      hasLocations,
      locationsCount: locationsCount || 0,
      hasAssignedSupervisors,
      assignedCount: assignedCount || 0,
      hasNonPendingStatus,
      nonPendingCount: nonPendingCount || 0,
      hasCountHistory,
      countHistoryCount,
      isActive: hasLocations || hasAssignedSupervisors || hasNonPendingStatus || hasCountHistory
    };
  };

  const recomputeCombined = (mp: ParseResult | null, pp: ParseResult | null) => {
    const mpData = mp?.data || [];
    const ppData = pp?.data || [];
    const total = mpData.length + ppData.length;

    if (total === 0) {
      setValidation(null);
      setCombinedData([]);
      setState('idle');
      return;
    }

    setValidation(validateCombinedData(mpData, ppData, []));
    setCombinedData([...mpData, ...ppData]);
    setState('preview');
  };

  const handleFileSelect = async (type: 'MP' | 'PP', file: File | null) => {
    const setFile = type === 'MP' ? setMpFile : setPpFile;
    const setResult = type === 'MP' ? setMpResult : setPpResult;

    setFile(file);
    setResult(null);
    setValidation(null);
    setCombinedData([]);
    setState('idle');

    if (!file) {
      // Recompute using remaining files
      recomputeCombined(type === 'MP' ? null : mpResult, type === 'PP' ? null : ppResult);
      return;
    }

    setState('parsing');
    const result = await parseExcelFile(file, type);
    setResult(result);

    recomputeCombined(type === 'MP' ? result : mpResult, type === 'PP' ? result : ppResult);
  };

  const handleMpFileSelect = (file: File | null) => handleFileSelect('MP', file);
  const handlePpFileSelect = (file: File | null) => handleFileSelect('PP', file);

  const handleImportClick = async () => {
    if (combinedData.length === 0) return;

    if (importMode === 'new') {
      if (!newInventoryName.trim()) {
        toast({
          title: 'Falta el nombre',
          description: 'Escribe el nombre del nuevo inventario (por ejemplo: Semestral 2026-2)',
          variant: 'destructive',
        });
        return;
      }
      // Crear inventario nuevo NO borra nada: no requiere confirmación destructiva
      executeImport();
      return;
    }

    if (isReadOnly) {
      toast({
        title: 'Inventario histórico',
        description: 'Selecciona el inventario abierto o crea uno nuevo para poder importar',
        variant: 'destructive',
      });
      return;
    }

    setState('checking');
    const check = await checkActiveInventory();
    setActiveCheck(check);

    if (check.isActive) {
      setShowConfirmDialog(true);
      setConfirmText('');
      setState('preview');
    } else {
      executeImport();
    }
  };

  const handleConfirmedImport = () => {
    if (confirmText === 'BORRAR') {
      setShowConfirmDialog(false);
      setConfirmText('');
      executeImport();
    }
  };

  const executeImport = async () => {
    setState('importing');
    setProgress(0);

    try {
      // Remove cant_total_erp since it's a generated column in the database
      const dataToInsert = combinedData.map(({ cant_total_erp, ...rest }) => rest);

      // Determinar qué familias se están importando
      const typesInImport = Array.from(new Set(dataToInsert.map((r) => r.material_type))) as MaterialType[];

      // Inventario destino de esta importación
      let targetInventoryId = inventoryId!;

      if (importMode === 'new') {
        setProgress(3);

        // Cerrar el inventario abierto actual (solo puede haber uno abierto)
        if (inventoryId) {
          const { error: closeError } = await supabase
            .from('inventories')
            .update({ status: 'cerrado', fecha_cierre: new Date().toISOString() })
            .eq('id', inventoryId)
            .eq('status', 'abierto');
          if (closeError) {
            throw new Error(`Error al cerrar el inventario actual: ${closeError.message}`);
          }
        }

        const { data: created, error: createError } = await supabase
          .from('inventories')
          .insert({
            nombre: newInventoryName.trim(),
            fecha_inicio: newInventoryDate,
            status: 'abierto',
          })
          .select('id')
          .single();

        if (createError || !created) {
          throw new Error(`Error al crear el inventario: ${createError?.message || 'desconocido'}`);
        }

        targetInventoryId = created.id;
      } else {
        // Reemplazo dentro del inventario abierto: se borra SOLO la familia importada
        setProgress(3);
        const { data: existingRefs, error: refsError } = await supabase
          .from('inventory_master')
          .select('referencia')
          .eq('inventory_id', targetInventoryId)
          .in('material_type', typesInImport);

        if (refsError) {
          throw new Error(`Error al consultar referencias existentes: ${refsError.message}`);
        }

        const refsToDelete = (existingRefs || []).map((r) => r.referencia);

        setProgress(6);
        const LOC_BATCH = 200;
        for (let i = 0; i < refsToDelete.length; i += LOC_BATCH) {
          const chunk = refsToDelete.slice(i, i + LOC_BATCH);
          const { error: locDeleteError } = await supabase
            .from('locations')
            .delete()
            .eq('inventory_id', targetInventoryId)
            .in('master_reference', chunk);
          if (locDeleteError) {
            throw new Error(`Error al eliminar ubicaciones: ${locDeleteError.message}`);
          }
        }

        setProgress(10);
        const { error: deleteError } = await supabase
          .from('inventory_master')
          .delete()
          .eq('inventory_id', targetInventoryId)
          .in('material_type', typesInImport);

        if (deleteError) {
          throw new Error(`Error al eliminar datos existentes: ${deleteError.message}`);
        }
      }

      // Step 3: Insert in batches of 500
      const BATCH_SIZE = 500;
      const batches = [];
      for (let i = 0; i < dataToInsert.length; i += BATCH_SIZE) {
        batches.push(dataToInsert.slice(i, i + BATCH_SIZE));
      }

      const progressPerBatch = 80 / batches.length;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const { error: insertError } = await supabase
          .from('inventory_master')
          .insert(batch.map((row) => ({ ...row, inventory_id: targetInventoryId })) as any);

        if (insertError) {
          throw new Error(`Error al insertar lote ${i + 1}: ${insertError.message}`);
        }

        setProgress(10 + (i + 1) * progressPerBatch);
      }

      setProgress(100);
      setState('success');

      await refetchInventories();
      if (importMode === 'new') {
        setSelectedInventoryId(targetInventoryId);
      }

      toast({
        title: 'Importación exitosa',
        description:
          importMode === 'new'
            ? `Inventario "${newInventoryName.trim()}" creado con ${combinedData.length} referencias`
            : `Se importaron ${combinedData.length} referencias correctamente`,
      });

      // Reset after success
      setTimeout(() => {
        setMpFile(null);
        setPpFile(null);
        setPtFile(null);
        setMpResult(null);
        setPpResult(null);
        setPtResult(null);
        setValidation(null);
        setCombinedData([]);
        setState('idle');
        setProgress(0);
        setActiveCheck(null);
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
    setPtFile(null);
    setMpResult(null);
    setPpResult(null);
    setPtResult(null);
    setValidation(null);
    setCombinedData([]);
    setState('idle');
    setProgress(0);
  };

  const mpCount = mpResult?.data.length || 0;
  const ppCount = ppResult?.data.length || 0;
  const ptCount = ptResult?.data.length || 0;
  const totalCount = mpCount + ppCount + ptCount;
  const typesInImport: MaterialType[] = [
    ...(mpCount > 0 ? (['MP'] as const) : []),
    ...(ppCount > 0 ? (['PP'] as const) : []),
    ...(ptCount > 0 ? (['PT'] as const) : []),
  ];

  const allWarnings = [
    ...(mpResult?.warnings || []),
    ...(ppResult?.warnings || []),
    ...(ptResult?.warnings || []),
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
            Reemplaza familias de maestra en el inventario activo o crea un inventario nuevo
          </p>
        </div>
        {(mpFile || ppFile || ptFile) && state !== 'importing' && (
          <Button variant="outline" onClick={handleClear}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Modo de importación */}
      <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
        <div>
          <p className="font-medium text-foreground">¿Dónde se carga esta maestra?</p>
          <p className="text-sm text-muted-foreground">
            Inventario abierto actual: <strong>{inventory?.nombre || '—'}</strong>
          </p>
        </div>

        <RadioGroup
          value={importMode}
          onValueChange={(v) => setImportMode(v as 'replace' | 'new')}
          className="space-y-2"
          disabled={state === 'importing'}
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="replace" id="mode-replace" className="mt-1" />
            <Label htmlFor="mode-replace" className="font-normal cursor-pointer">
              <span className="font-medium">Reemplazar familias del inventario abierto</span>
              <span className="block text-sm text-muted-foreground">
                Solo se borra y vuelve a cargar la familia que elijas (MP, PP o PT). Las demás familias y los inventarios históricos no se tocan.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="new" id="mode-new" className="mt-1" />
            <Label htmlFor="mode-new" className="font-normal cursor-pointer">
              <span className="font-medium">Crear un inventario nuevo</span>
              <span className="block text-sm text-muted-foreground">
                No borra nada. El inventario actual se cierra y queda como histórico de solo lectura.
              </span>
            </Label>
          </div>
        </RadioGroup>

        {importMode === 'new' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="new-inv-name">Nombre del inventario</Label>
              <Input
                id="new-inv-name"
                placeholder="Ej: Semestral 2026-2"
                value={newInventoryName}
                onChange={(e) => setNewInventoryName(e.target.value)}
                disabled={state === 'importing'}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-inv-date">Fecha de inicio</Label>
              <Input
                id="new-inv-date"
                type="date"
                value={newInventoryDate}
                onChange={(e) => setNewInventoryDate(e.target.value)}
                disabled={state === 'importing'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Botones de reemplazo (inventario abierto) o zonas de carga (nuevo inventario) */}
      {hasOpenInventory && importMode === 'replace' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FamilyReplaceButton
              type="MP"
              count={familyCounts.MP}
              isSelected={selectedFamily === 'MP'}
              hasFile={!!mpFile}
              fileName={mpFile?.name}
              onSelect={() => setSelectedFamily('MP')}
              onClear={() => handleMpFileSelect(null)}
              disabled={state === 'importing' || familyCountsLoading}
            />
            <FamilyReplaceButton
              type="PP"
              count={familyCounts.PP}
              isSelected={selectedFamily === 'PP'}
              hasFile={!!ppFile}
              fileName={ppFile?.name}
              onSelect={() => setSelectedFamily('PP')}
              onClear={() => handlePpFileSelect(null)}
              disabled={state === 'importing' || familyCountsLoading}
            />
            <FamilyReplaceButton
              type="PT"
              count={familyCounts.PT}
              isSelected={selectedFamily === 'PT'}
              hasFile={!!ptFile}
              fileName={ptFile?.name}
              onSelect={() => setSelectedFamily('PT')}
              onClear={() => handlePtFileSelect(null)}
              disabled={state === 'importing' || familyCountsLoading}
            />
          </div>

          {selectedFamily && (
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  Subir archivo para reemplazar <strong>{selectedFamily}</strong>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFamily(null)}
                  disabled={state === 'importing'}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cerrar
                </Button>
              </div>
              {selectedFamily === 'MP' && (
                <FileUploadZone
                  type="MP"
                  file={mpFile}
                  onFileSelect={handleMpFileSelect}
                  disabled={state === 'importing'}
                  parseResult={mpResult}
                />
              )}
              {selectedFamily === 'PP' && (
                <FileUploadZone
                  type="PP"
                  file={ppFile}
                  onFileSelect={handlePpFileSelect}
                  disabled={state === 'importing'}
                  parseResult={ppResult}
                />
              )}
              {selectedFamily === 'PT' && (
                <FileUploadZone
                  type="PT"
                  file={ptFile}
                  onFileSelect={handlePtFileSelect}
                  disabled={state === 'importing'}
                  parseResult={ptResult}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <FileUploadZone
            type="PT"
            file={ptFile}
            onFileSelect={handlePtFileSelect}
            disabled={state === 'importing'}
            parseResult={ptResult}
          />
        </div>
      )}


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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                {mpCount} MP
              </Badge>
              <span className="text-muted-foreground">+</span>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                {ppCount} PP
              </Badge>
              <span className="text-muted-foreground">+</span>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                {ptCount} PT
              </Badge>
              <span className="text-muted-foreground">=</span>
              <Badge variant="default">
                {totalCount} Total
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              Se reemplazará{typesInImport.length > 1 ? 'n' : ''} solo: <strong>{typesInImport.join(', ')}</strong>
            </div>
          </div>


          {/* Preview Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="max-h-96 overflow-x-auto overflow-y-auto">
              <Table className="min-w-[1400px]">
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    {/* Columnas principales */}
                    <TableHead className="min-w-[140px] font-mono text-xs bg-muted/50 sticky left-0 z-20">Referencia</TableHead>
                    <TableHead className="min-w-[60px] font-mono text-xs bg-muted/50">Tipo</TableHead>
                    <TableHead className="min-w-[100px] font-mono text-xs bg-muted/50">Control</TableHead>
                    
                    {/* Columnas compartidas */}
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-purple-500/10">Cant.PLd</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-purple-500/10">Cant.PLr</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-purple-500/10">Cant.ZA</TableHead>
                    <TableHead className="min-w-[90px] text-right font-mono text-xs bg-purple-500/10">Costo.T</TableHead>
                    
                    {/* Columnas solo MP */}
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-blue-500/10">Costo.U MP</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-blue-500/10">Cant.Alm MP</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-blue-500/10">Cant.ProvD</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-blue-500/10">Cant.ProvR</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-blue-500/10">Cant.T MP</TableHead>
                    
                    {/* Columnas solo PP */}
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-emerald-500/10">MP</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-emerald-500/10">MO</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-emerald-500/10">Servicio</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-emerald-500/10">Costo.U PP</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-emerald-500/10">Cant.Alm PP</TableHead>
                    <TableHead className="min-w-[80px] text-right font-mono text-xs bg-emerald-500/10">Cant.Prov PP</TableHead>
                    <TableHead className="min-w-[90px] text-right font-mono text-xs bg-emerald-500/10">Cant.Total PP</TableHead>
                    
                    {/* Total calculado */}
                    <TableHead className="min-w-[100px] text-right font-mono text-xs bg-amber-500/10">Total ERP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinedData.slice(0, 100).map((row, idx) => (
                    <TableRow key={idx}>
                      {/* Principales */}
                      <TableCell className="font-mono text-sm sticky left-0 bg-card">{row.referencia}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={
                            row.material_type === 'MP' ? 'border-blue-500/50 text-blue-600'
                            : row.material_type === 'PP' ? 'border-emerald-500/50 text-emerald-600'
                            : 'border-amber-500/50 text-amber-600'
                          }
                        >
                          {row.material_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.control || '—'}</TableCell>
                      
                      {/* Compartidas */}
                      <TableCell className="text-right tabular-nums">{formatNumber(row.cant_pld)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.cant_plr)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.cant_za)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.costo_t)}</TableCell>
                      
                      {/* Solo MP */}
                      <TableCell className="text-right tabular-nums text-blue-600">{formatNumber(row.costo_u_mp)}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600">{formatNumber(row.cant_alm_mp)}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600">{formatNumber(row.cant_prov_d)}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600">{formatNumber(row.cant_prov_r)}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600">{formatNumber(row.cant_t_mp)}</TableCell>
                      
                      {/* Solo PP */}
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.mp_costo)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.mo_costo)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.servicio)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.costo_u_pp)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.cant_alm_pp)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.cant_prov_pp)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{formatNumber(row.cant_total_pp)}</TableCell>
                      
                      {/* Total */}
                      <TableCell className="text-right tabular-nums font-medium text-amber-600">
                        {formatNumber(row.cant_total_erp)}
                      </TableCell>
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
          {state !== 'importing' && state !== 'success' && (
            <div className="flex justify-end">
              <Button
                onClick={handleImportClick}
                disabled={!canImport || state === ('checking' as ImportState)}
                size="lg"
                className="min-w-[200px]"
              >
                {state === ('checking' as ImportState) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : state === 'error' ? (
                  <>{importMode === 'replace' ? 'Reintentar Reemplazo' : 'Reintentar Importación'}</>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    {importMode === 'replace' ? `Reemplazar ${totalCount} Referencias` : `Importar ${totalCount} Referencias`}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Active Inventory */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              ¡Atención! Inventario Activo Detectado
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left">
                <p className="text-foreground font-medium">
                  Dentro del inventario <strong>{inventory?.nombre || '—'}</strong> se reemplazará solo la familia:{' '}
                  <strong>{typesInImport.join(', ')}</strong>. Esta acción eliminará permanentemente los datos
                  existentes de esa(s) familia(s) en ESTE inventario. Los inventarios históricos no se tocan.
                </p>

                
                <ul className="space-y-2 text-sm">
                  {activeCheck?.hasLocations && (
                    <li className="flex items-center gap-2">
                      <X className="w-4 h-4 text-destructive" />
                      <span><strong>{activeCheck.locationsCount}</strong> ubicaciones configuradas</span>
                    </li>
                  )}
                  {activeCheck?.hasAssignedSupervisors && (
                    <li className="flex items-center gap-2">
                      <X className="w-4 h-4 text-destructive" />
                      <span><strong>{activeCheck.assignedCount}</strong> supervisores asignados</span>
                    </li>
                  )}
                  {activeCheck?.hasNonPendingStatus && (
                    <li className="flex items-center gap-2">
                      <X className="w-4 h-4 text-destructive" />
                      <span><strong>{activeCheck.nonPendingCount}</strong> referencias con conteo en progreso</span>
                    </li>
                  )}
                  {activeCheck?.hasCountHistory && (
                    <li className="flex items-center gap-2">
                      <X className="w-4 h-4 text-destructive" />
                      <span><strong>{activeCheck.countHistoryCount}</strong> referencias con historial de conteo</span>
                    </li>
                  )}
                </ul>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">
                    Para confirmar, escriba <strong className="text-destructive">BORRAR</strong> en el campo:
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="Escriba BORRAR"
                    className="font-mono"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setConfirmText('');
              setShowConfirmDialog(false);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedImport}
              disabled={confirmText !== 'BORRAR'}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar Borrado e Importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MasterDataImport;
