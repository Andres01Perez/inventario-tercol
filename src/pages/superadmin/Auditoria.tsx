import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import { 
  Search, 
  ChevronDown,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Edit3,
  History,
  FileSearch,
  Info
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';

interface AuditRow {
  locationId: string;
  referencia: string;
  materialType: string;
  locationName: string | null;
  locationDetail: string | null;
  subcategoria: string | null;
  puntoReferencia: string | null;
  metodoConteo: string | null;
  observaciones: string | null;
  cantTotalErp: number;
  statusSlug: string;
  auditRound: number;
  countHistory: any;
  validatedAtRound: number | null;
  validatedQuantity: number | null;
  discoveredAtRound: number | null;
  counts: {
    c1: number | null;
    c2: number | null;
    c3: number | null;
    c4: number | null;
    c5: number | null;
  };
}

interface GroupedReference {
  referencia: string;
  materialType: string;
  cantTotalErp: number;
  statusSlug: string;
  auditRound: number;
  countHistory: any;
  rows: AuditRow[];
  totals: {
    c1: number | null;
    c2: number | null;
    c3: number | null;
    c4: number | null;
    c5: number | null;
  };
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  auditado: { label: 'Auditado', variant: 'default' },
  conflicto: { label: 'Conflicto', variant: 'outline' },
  critico: { label: 'Crítico', variant: 'destructive' },
  cerrado_forzado: { label: 'Cerrado Forzado', variant: 'default' },
};

const ITEMS_PER_PAGE = 30;

const LocationInfoPopover: React.FC<{ row: AuditRow }> = ({ row }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <Info className="w-4 h-4 text-muted-foreground hover:text-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-72" align="start">
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Información de Ubicación</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Ubicación:</span>{' '}
            <span className="font-medium">{row.locationName || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Detalle:</span>{' '}
            <span className="font-medium">{row.locationDetail || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Subcategoría:</span>{' '}
            <span className="font-medium">{row.subcategoria || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Punto de Referencia:</span>{' '}
            <span className="font-medium">{row.puntoReferencia || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Método de Conteo:</span>{' '}
            <span className="font-medium">{row.metodoConteo || '-'}</span>
          </div>
          {row.observaciones && (
            <div>
              <span className="text-muted-foreground">Observaciones:</span>{' '}
              <span className="font-medium">{row.observaciones}</span>
            </div>
          )}
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

const Auditoria: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<{ referencia: string; history: any[] } | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  // Debounced search for server-side filtering
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, materialTypeFilter, statusFilter, locationFilter]);

  // Query for unique location names (for filter dropdown)
  const { data: locationOptions } = useQuery({
    queryKey: ['audit-location-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('location_name');
      
      if (error) throw error;
      return [...new Set(data?.map(d => d.location_name).filter(Boolean))] as string[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['audit-full-view', currentPage, debouncedSearch, materialTypeFilter, statusFilter, locationFilter],
    queryFn: async () => {
      // 1. Build query with filters and pagination on inventory_master
      let masterQuery = supabase
        .from('inventory_master')
        .select('referencia, material_type, cant_total_erp, status_slug, audit_round, count_history', { count: 'exact' });
      
      // Apply filters
      if (debouncedSearch) {
        masterQuery = masterQuery.ilike('referencia', `%${debouncedSearch}%`);
      }
      if (materialTypeFilter !== 'all') {
        masterQuery = masterQuery.eq('material_type', materialTypeFilter as 'MP' | 'PP');
      }
      if (statusFilter !== 'all') {
        masterQuery = masterQuery.eq('status_slug', statusFilter);
      }
      
      // Server-side pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      masterQuery = masterQuery.range(from, to).order('referencia');
      
      const { data: masters, error: masterError, count } = await masterQuery;
      if (masterError) throw masterError;
      if (!masters || masters.length === 0) return { rows: [], totalCount: count || 0 };
      
      // 2. Get locations only for references in this page
      const refs = masters.map(m => m.referencia);
      let locationsQuery = supabase
        .from('locations')
        .select('id, master_reference, location_name, location_detail, subcategoria, punto_referencia, metodo_conteo, observaciones, validated_at_round, validated_quantity, discovered_at_round')
        .in('master_reference', refs);
      
      // Apply location filter if set
      if (locationFilter !== 'all') {
        locationsQuery = locationsQuery.eq('location_name', locationFilter);
      }
      
      const { data: locations, error: locError } = await locationsQuery;
      if (locError) throw locError;
      
      // 3. Get counts for those locations
      const locationIds = locations?.map(l => l.id) || [];
      let counts: { location_id: string; audit_round: number; quantity_counted: number }[] = [];
      
      if (locationIds.length > 0) {
        // Batch in chunks of 100 to avoid URL length issues
        const chunks = [];
        for (let i = 0; i < locationIds.length; i += 100) {
          chunks.push(locationIds.slice(i, i + 100));
        }
        
        const countsResults = await Promise.all(
          chunks.map(chunk => 
            supabase
              .from('inventory_counts')
              .select('location_id, audit_round, quantity_counted')
              .in('location_id', chunk)
          )
        );
        
        for (const result of countsResults) {
          if (result.error) throw result.error;
          if (result.data) counts.push(...result.data);
        }
      }
      
      // 4. Build counts map
      const countsMap = new Map<string, { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null }>();
      locations?.forEach(loc => {
        countsMap.set(loc.id, { c1: null, c2: null, c3: null, c4: null, c5: null });
      });
      counts.forEach(count => {
        const existing = countsMap.get(count.location_id);
        if (existing) {
          const key = `c${count.audit_round}` as keyof typeof existing;
          if (key in existing) {
            existing[key] = count.quantity_counted;
          }
        }
      });
      
      // 5. Group by reference
      const masterMap = new Map(masters.map(m => [m.referencia, m]));
      const locationsMap = new Map<string, typeof locations>();
      locations?.forEach(loc => {
        const existing = locationsMap.get(loc.master_reference) || [];
        existing.push(loc);
        locationsMap.set(loc.master_reference, existing);
      });
      
      // 6. Build grouped rows maintaining master order
      const rows: AuditRow[] = [];
      masters.forEach(master => {
        const locs = locationsMap.get(master.referencia) || [];
        locs.forEach(loc => {
          rows.push({
            locationId: loc.id,
            referencia: master.referencia,
            materialType: master.material_type || 'MP',
            locationName: loc.location_name,
            locationDetail: loc.location_detail,
            subcategoria: loc.subcategoria,
            puntoReferencia: loc.punto_referencia,
            metodoConteo: loc.metodo_conteo,
            observaciones: loc.observaciones,
            cantTotalErp: master.cant_total_erp || 0,
            statusSlug: master.status_slug || 'pendiente',
            auditRound: master.audit_round || 1,
            countHistory: master.count_history || [],
            validatedAtRound: loc.validated_at_round,
            validatedQuantity: loc.validated_quantity,
            discoveredAtRound: loc.discovered_at_round,
            counts: countsMap.get(loc.id) || { c1: null, c2: null, c3: null, c4: null, c5: null },
          });
        });
      });
      
      return { rows, totalCount: count || 0 };
    },
    staleTime: 2 * 60 * 1000,
  });

  const groupedData = useMemo(() => {
    if (!auditData?.rows) return [];
    
    const groups = new Map<string, AuditRow[]>();
    auditData.rows.forEach(row => {
      const existing = groups.get(row.referencia) || [];
      existing.push(row);
      groups.set(row.referencia, existing);
    });

    const calculateSum = (rows: AuditRow[], key: keyof AuditRow['counts']): number | null => {
      const validCounts = rows.map(r => r.counts[key]).filter(v => v !== null) as number[];
      return validCounts.length > 0 ? validCounts.reduce((a, b) => a + b, 0) : null;
    };

    return Array.from(groups.entries()).map(([referencia, rows]): GroupedReference => ({
      referencia,
      materialType: rows[0].materialType,
      cantTotalErp: rows[0].cantTotalErp,
      statusSlug: rows[0].statusSlug,
      auditRound: rows[0].auditRound,
      countHistory: rows[0].countHistory,
      rows,
      totals: {
        c1: calculateSum(rows, 'c1'),
        c2: calculateSum(rows, 'c2'),
        c3: calculateSum(rows, 'c3'),
        c4: calculateSum(rows, 'c4'),
        c5: calculateSum(rows, 'c5'),
      },
    }));
  }, [auditData?.rows]);

  const totalPages = Math.ceil((auditData?.totalCount || 0) / ITEMS_PER_PAGE);
  const paginatedGroups = groupedData; // Data is already paginated from server

  const handleViewHistory = (referencia: string, history: any[]) => {
    setSelectedHistory({ referencia, history });
    setHistoryDialogOpen(true);
  };

  const toggleExpand = (referencia: string) => {
    setExpandedRefs(prev => {
      const next = new Set(prev);
      if (next.has(referencia)) {
        next.delete(referencia);
      } else {
        next.add(referencia);
      }
      return next;
    });
  };

  const renderCountCell = (value: number | null, erp: number, round: number, currentRound: number, discoveredAtRound: number | null = null) => {
    // Si la ubicación fue descubierta en un round posterior, mostrar "-" para rounds anteriores
    if (discoveredAtRound !== null && round < discoveredAtRound) {
      return <span className="text-muted-foreground/50">-</span>;
    }
    
    if (value === null) {
      return <span className="text-muted-foreground">-</span>;
    }

    const matchesErp = value === erp;
    const isCurrentRound = round <= currentRound;

    return (
      <span className={`font-medium ${matchesErp ? 'text-green-600 dark:text-green-400' : isCurrentRound ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pendiente;
    return (
      <Badge variant={config.variant} className="whitespace-nowrap">
        {config.label}
      </Badge>
    );
  };

  const renderGroupRows = (group: GroupedReference) => {
    const hasMultipleLocations = group.rows.length > 1;
    const isExpanded = expandedRefs.has(group.referencia);

    // Single location: render one row with all info
    if (!hasMultipleLocations) {
      const row = group.rows[0];
      return (
        <TableRow key={group.referencia} className="hover:bg-muted/30">
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              <span>{group.referencia}</span>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline" className={group.materialType === 'MP' ? 'border-orange-500/50 text-orange-600' : 'border-emerald-500/50 text-emerald-600'}>
              {group.materialType}
            </Badge>
          </TableCell>
          <TableCell>
            <LocationInfoPopover row={row} />
          </TableCell>
          <TableCell className="text-right font-bold">{group.cantTotalErp}</TableCell>
          <TableCell className="text-right">{renderCountCell(group.totals.c1, group.cantTotalErp, 1, group.auditRound)}</TableCell>
          <TableCell className="text-right">{renderCountCell(group.totals.c2, group.cantTotalErp, 2, group.auditRound)}</TableCell>
          <TableCell className="text-right">{renderCountCell(group.totals.c3, group.cantTotalErp, 3, group.auditRound)}</TableCell>
          <TableCell className="text-right">{renderCountCell(group.totals.c4, group.cantTotalErp, 4, group.auditRound)}</TableCell>
          <TableCell className="text-right">{renderCountCell(group.totals.c5, group.cantTotalErp, 5, group.auditRound)}</TableCell>
          <TableCell>{getStatusBadge(group.statusSlug)}</TableCell>
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleViewHistory(group.referencia, group.countHistory)}>
                  <History className="w-4 h-4 mr-2" />
                  Ver Historial
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Validar Manualmente
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <XCircle className="w-4 h-4 mr-2" />
                  Cerrar Forzado
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Edit3 className="w-4 h-4 mr-2" />
                  Editar Conteo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      );
    }

    // Multiple locations: collapsible accordion
    return (
      <React.Fragment key={group.referencia}>
        {/* Main row (always visible) */}
        <TableRow 
          className="hover:bg-muted/30 cursor-pointer"
          onClick={() => toggleExpand(group.referencia)}
        >
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <span>{group.referencia}</span>
              <Badge variant="secondary" className="text-xs">
                {group.rows.length} ubic.
              </Badge>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline" className={group.materialType === 'MP' ? 'border-orange-500/50 text-orange-600' : 'border-emerald-500/50 text-emerald-600'}>
              {group.materialType}
            </Badge>
          </TableCell>
          <TableCell></TableCell>
          <TableCell className="text-right font-bold">{group.cantTotalErp}</TableCell>
          <TableCell className="text-right font-bold">{renderCountCell(group.totals.c1, group.cantTotalErp, 1, group.auditRound)}</TableCell>
          <TableCell className="text-right font-bold">{renderCountCell(group.totals.c2, group.cantTotalErp, 2, group.auditRound)}</TableCell>
          <TableCell className="text-right font-bold">{renderCountCell(group.totals.c3, group.cantTotalErp, 3, group.auditRound)}</TableCell>
          <TableCell className="text-right font-bold">{renderCountCell(group.totals.c4, group.cantTotalErp, 4, group.auditRound)}</TableCell>
          <TableCell className="text-right font-bold">{renderCountCell(group.totals.c5, group.cantTotalErp, 5, group.auditRound)}</TableCell>
          <TableCell>{getStatusBadge(group.statusSlug)}</TableCell>
          <TableCell onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleViewHistory(group.referencia, group.countHistory)}>
                  <History className="w-4 h-4 mr-2" />
                  Ver Historial
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Validar Manualmente
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <XCircle className="w-4 h-4 mr-2" />
                  Cerrar Forzado
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Edit3 className="w-4 h-4 mr-2" />
                  Editar Conteo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>

        {/* Expanded location rows */}
        {isExpanded && group.rows.map((row, idx) => {
          const isValidated = row.validatedAtRound !== null;
          const isDiscovered = row.discoveredAtRound !== null;
          return (
            <TableRow key={row.locationId} className={`${isValidated ? 'bg-green-500/10' : isDiscovered ? 'bg-amber-500/10' : 'bg-muted/20'} hover:bg-muted/40`}>
              <TableCell className="pl-10">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground text-sm">
                    {idx === group.rows.length - 1 ? '└' : '├'} Ubicación {idx + 1}
                  </span>
                  {isDiscovered && (
                    <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs">
                      Descubierta C{row.discoveredAtRound}
                    </Badge>
                  )}
                  {isValidated && (
                    <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-xs gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Validada C{row.validatedAtRound} ({row.validatedQuantity})
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell></TableCell>
              <TableCell>
                <LocationInfoPopover row={row} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              <TableCell className="text-right">{renderCountCell(row.counts.c1, row.cantTotalErp, 1, row.auditRound, row.discoveredAtRound)}</TableCell>
              <TableCell className="text-right">{renderCountCell(row.counts.c2, row.cantTotalErp, 2, row.auditRound, row.discoveredAtRound)}</TableCell>
              <TableCell className="text-right">{renderCountCell(row.counts.c3, row.cantTotalErp, 3, row.auditRound, row.discoveredAtRound)}</TableCell>
              <TableCell className="text-right">{renderCountCell(row.counts.c4, row.cantTotalErp, 4, row.auditRound, row.discoveredAtRound)}</TableCell>
              <TableCell className="text-right">{renderCountCell(row.counts.c5, row.cantTotalErp, 5, row.auditRound, row.discoveredAtRound)}</TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <AppLayout title="Auditoría General" showBackButton>
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={materialTypeFilter} onValueChange={setMaterialTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="MP">Materia Prima</SelectItem>
                <SelectItem value="PP">Producto Proceso</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="auditado">Auditado</SelectItem>
                <SelectItem value="conflicto">Conflicto</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
                <SelectItem value="cerrado_forzado">Cerrado Forzado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ubicación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las ubicaciones</SelectItem>
                {locationOptions?.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {paginatedGroups.length} referencias ({auditData?.rows.length || 0} ubicaciones) de {auditData?.totalCount || 0} referencias totales
          </span>
          {(debouncedSearch || materialTypeFilter !== 'all' || statusFilter !== 'all' || locationFilter !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setMaterialTypeFilter('all');
                setStatusFilter('all');
                setLocationFilter('all');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Referencia</TableHead>
                <TableHead className="font-semibold">Tipo</TableHead>
                <TableHead className="font-semibold w-[60px]">Info</TableHead>
                <TableHead className="font-semibold text-right">ERP</TableHead>
                <TableHead className="font-semibold text-right">C1</TableHead>
                <TableHead className="font-semibold text-right">C2</TableHead>
                <TableHead className="font-semibold text-right">C3</TableHead>
                <TableHead className="font-semibold text-right">C4</TableHead>
                <TableHead className="font-semibold text-right">C5</TableHead>
                <TableHead className="font-semibold">Estado</TableHead>
                <TableHead className="font-semibold w-[60px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileSearch className="w-8 h-8" />
                      <span>No se encontraron registros</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedGroups.map((group) => renderGroupRows(group))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink 
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial de Conteos - {selectedHistory?.referencia}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {selectedHistory?.history && selectedHistory.history.length > 0 ? (
              selectedHistory.history.map((entry, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">Ronda {entry.round}</Badge>
                    {entry.closed_by_superadmin && (
                      <Badge variant="destructive">Cerrado por Superadmin</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {entry.sum_c1 !== undefined && (
                      <div>
                        <span className="text-muted-foreground">C1:</span>{' '}
                        <span className="font-medium">{entry.sum_c1}</span>
                      </div>
                    )}
                    {entry.sum_c2 !== undefined && (
                      <div>
                        <span className="text-muted-foreground">C2:</span>{' '}
                        <span className="font-medium">{entry.sum_c2}</span>
                      </div>
                    )}
                    {entry.sum !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Suma:</span>{' '}
                        <span className="font-medium">{entry.sum}</span>
                      </div>
                    )}
                    {entry.erp !== undefined && (
                      <div>
                        <span className="text-muted-foreground">ERP:</span>{' '}
                        <span className="font-medium">{entry.erp}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No hay historial de conteos registrado
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Auditoria;
