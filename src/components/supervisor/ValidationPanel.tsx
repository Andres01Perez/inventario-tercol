import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, CheckCircle2, RefreshCw, AlertTriangle, ArrowRight, Eye } from 'lucide-react';

interface ValidationPanelProps {
  isAdminMode?: boolean;
  controlFilter?: 'not_null' | 'null' | 'all';
}

interface ReferenceWithCounts {
  referencia: string;
  material_type: string;
  audit_round: number;
  cant_total_erp: number | null;
  status_slug: string | null;
  locationCount: number;
  c1Count: number;
  c2Count: number;
  sumC1: number;
  sumC2: number;
  isComplete: boolean;
}

const ValidationPanel: React.FC<ValidationPanelProps> = ({
  isAdminMode = false,
  controlFilter = 'all',
}) => {
  const { user } = useAuth();

  // Fetch references with their location counts
  const { data: referencesData = [], isLoading, refetch } = useQuery({
    queryKey: ['validation-references', user?.id, isAdminMode, controlFilter],
    queryFn: async () => {
      // First get all relevant references
      let masterQuery = supabase
        .from('inventory_master')
        .select('referencia, material_type, audit_round, cant_total_erp, status_slug')
        .eq('audit_round', 1) // Only show references in initial round
        .not('status_slug', 'eq', 'auditado'); // Exclude already audited

      if (controlFilter === 'not_null') {
        masterQuery = masterQuery.not('control', 'is', null);
      } else if (controlFilter === 'null') {
        masterQuery = masterQuery.is('control', null);
      }

      const { data: masters, error: masterError } = await masterQuery;
      if (masterError) throw masterError;
      if (!masters || masters.length === 0) return [];

      // Get locations for these references
      let locQuery = supabase
        .from('locations')
        .select('id, master_reference')
        .in('master_reference', masters.map(m => m.referencia));

      if (!isAdminMode) {
        locQuery = locQuery.eq('assigned_supervisor_id', user!.id);
      }

      const { data: locations, error: locError } = await locQuery;
      if (locError) throw locError;
      if (!locations || locations.length === 0) return [];

      // Get counts for these locations
      const locationIds = locations.map(l => l.id);
      const { data: counts, error: countError } = await supabase
        .from('inventory_counts')
        .select('location_id, audit_round, quantity_counted')
        .in('location_id', locationIds)
        .in('audit_round', [1, 2]);

      if (countError) throw countError;

      // Group by reference and calculate
      const referenceMap = new Map<string, ReferenceWithCounts>();

      masters.forEach(m => {
        referenceMap.set(m.referencia, {
          referencia: m.referencia,
          material_type: m.material_type,
          audit_round: m.audit_round || 1,
          cant_total_erp: m.cant_total_erp,
          status_slug: m.status_slug,
          locationCount: 0,
          c1Count: 0,
          c2Count: 0,
          sumC1: 0,
          sumC2: 0,
          isComplete: false,
        });
      });

      // Count locations per reference
      locations.forEach(loc => {
        const ref = referenceMap.get(loc.master_reference);
        if (ref) {
          ref.locationCount++;
        }
      });

      // Sum counts
      const locationRefMap = new Map(locations.map(l => [l.id, l.master_reference]));
      
      counts?.forEach(c => {
        const refName = locationRefMap.get(c.location_id!);
        if (!refName) return;
        const ref = referenceMap.get(refName);
        if (!ref) return;

        if (c.audit_round === 1) {
          ref.c1Count++;
          ref.sumC1 += Number(c.quantity_counted) || 0;
        } else if (c.audit_round === 2) {
          ref.c2Count++;
          ref.sumC2 += Number(c.quantity_counted) || 0;
        }
      });

      // Calculate completeness
      referenceMap.forEach(ref => {
        ref.isComplete = ref.locationCount > 0 && 
                         ref.c1Count === ref.locationCount && 
                         ref.c2Count === ref.locationCount;
      });

      // Filter to only those with supervisor's locations and return sorted
      return Array.from(referenceMap.values())
        .filter(r => r.locationCount > 0)
        .sort((a, b) => {
          // Prioritize complete ones
          if (a.isComplete && !b.isComplete) return -1;
          if (!a.isComplete && b.isComplete) return 1;
          return a.referencia.localeCompare(b.referencia);
        });
    },
    enabled: !!user?.id,
  });

  const completeReferences = useMemo(() => 
    referencesData.filter(r => r.isComplete), 
    [referencesData]
  );

  const incompleteReferences = useMemo(() => 
    referencesData.filter(r => !r.isComplete), 
    [referencesData]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (referencesData.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-muted-foreground">No hay referencias pendientes de validación</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Panel de Monitoreo
          </h3>
          <p className="text-sm text-muted-foreground">
            Vista de solo lectura - La validación ocurre automáticamente al completar C1 y C2
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Recargar
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-blue-600 dark:text-blue-400">Validación Automática Activa</p>
          <p className="text-sm text-muted-foreground">
            Cuando una referencia tenga C1 y C2 completos, se validará automáticamente al guardar el último conteo.
            Si coincide con ERP o hay consistencia física, se marcará como AUDITADO. De lo contrario, pasará a C3.
          </p>
        </div>
      </div>

      {/* Complete references - will auto-validate */}
      {completeReferences.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500/10 text-green-500">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Completas (Pendiente validación automática)
            </Badge>
            <span className="text-sm text-muted-foreground">
              {completeReferences.length} referencia(s)
            </span>
          </div>

          <div className="border rounded-lg border-green-500/30 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-center">Ubicaciones</TableHead>
                  <TableHead className="text-right">Suma C1</TableHead>
                  <TableHead className="text-right">Suma C2</TableHead>
                  <TableHead className="text-right">ERP</TableHead>
                  <TableHead className="text-center">Predicción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completeReferences.map((ref) => {
                  const matchesERP = ref.sumC1 === ref.cant_total_erp || ref.sumC2 === ref.cant_total_erp;
                  const matchesPhysical = ref.sumC1 === ref.sumC2;
                  const willPass = matchesERP || matchesPhysical;

                  return (
                    <TableRow key={ref.referencia}>
                      <TableCell>
                        <Badge variant="outline">{ref.material_type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{ref.referencia}</TableCell>
                      <TableCell className="text-center">{ref.locationCount}</TableCell>
                      <TableCell className="text-right font-mono">{ref.sumC1}</TableCell>
                      <TableCell className="text-right font-mono">{ref.sumC2}</TableCell>
                      <TableCell className="text-right font-mono">{ref.cant_total_erp ?? '-'}</TableCell>
                      <TableCell className="text-center">
                        {willPass ? (
                          <Badge className="bg-green-500/10 text-green-500 text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Auditado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-500 text-xs">
                            <ArrowRight className="w-3 h-3 mr-1" />
                            → C3
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Incomplete references */}
      {incompleteReferences.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-muted text-muted-foreground">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Conteos Incompletos
            </Badge>
            <span className="text-sm text-muted-foreground">
              {incompleteReferences.length} referencia(s) pendiente(s)
            </span>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-center">Ubicaciones</TableHead>
                  <TableHead className="text-center">C1</TableHead>
                  <TableHead className="text-center">C2</TableHead>
                  <TableHead className="text-right">ERP</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incompleteReferences.map((ref) => (
                  <TableRow key={ref.referencia} className="opacity-60">
                    <TableCell>
                      <Badge variant="outline">{ref.material_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{ref.referencia}</TableCell>
                    <TableCell className="text-center">{ref.locationCount}</TableCell>
                    <TableCell className="text-center">
                      <span className={ref.c1Count === ref.locationCount ? 'text-green-500' : 'text-amber-500'}>
                        {ref.c1Count}/{ref.locationCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={ref.c2Count === ref.locationCount ? 'text-green-500' : 'text-amber-500'}>
                        {ref.c2Count}/{ref.locationCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{ref.cant_total_erp ?? '-'}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        Faltan {(ref.locationCount - ref.c1Count) + (ref.locationCount - ref.c2Count)} conteos
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationPanel;