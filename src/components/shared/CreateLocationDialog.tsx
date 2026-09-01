import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/contexts/InventoryContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import SupervisorSelect from '@/components/shared/SupervisorSelect';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface NewLocationPayload {
  master_reference: string;
  inventory_id: string;
  location_name: string | null;
  location_detail: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  subcategoria: string | null;
  observaciones: string | null;
  assigned_supervisor_id: string | null;
  assigned_admin_id: string;
  activo: boolean;
  terminado: boolean;
}

interface AdminOption {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'admin_mp' | 'admin_pp';
  label: string;
}

interface CreateLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterReference: string;
  defaultBodega?: 'almacen' | 'planta' | null;
  onSuccess?: () => void;
}

const CreateLocationDialog: React.FC<CreateLocationDialogProps> = ({
  open,
  onOpenChange,
  masterReference,
  defaultBodega = null,
  onSuccess,
}) => {
  const { profile, role } = useAuth();
  const { inventoryId, isReadOnly } = useInventory();
  const { toast } = useToast();

  const isSuperadmin = role === 'superadmin';
  const isAdminMP = role === 'admin_mp';
  const isAdminPP = role === 'admin_pp';

  const [bodega, setBodega] = useState<'almacen' | 'planta' | ''>(defaultBodega || '');
  const [locationName, setLocationName] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [puntoReferencia, setPuntoReferencia] = useState('');
  const [metodoConteo, setMetodoConteo] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [activo, setActivo] = useState(true);
  const [terminado, setTerminado] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: adminOptions } = useQuery<AdminOption[]>({
    queryKey: ['admin-bodega-options'],
    queryFn: async () => {
      if (!isSuperadmin) return [];
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin_mp', 'admin_pp']);
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);
      return roles.map((r) => {
        const p = profileMap.get(r.user_id);
        return {
          id: r.user_id,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          role: r.role as 'admin_mp' | 'admin_pp',
          label: `${r.role === 'admin_mp' ? 'Almacén' : 'Planta'} — ${p?.full_name || p?.email || r.user_id}`,
        };
      });
    },
    enabled: isSuperadmin && open,
    staleTime: 5 * 60 * 1000,
  });

  const assignedAdminId = useMemo(() => {
    if (isAdminMP) return profile?.id || null;
    if (isAdminPP) return profile?.id || null;
    if (!isSuperadmin || !bodega) return null;
    const targetRole = bodega === 'almacen' ? 'admin_mp' : 'admin_pp';
    return adminOptions?.find((a) => a.role === targetRole)?.id || null;
  }, [isAdminMP, isAdminPP, isSuperadmin, profile?.id, bodega, adminOptions]);

  const resetForm = () => {
    setBodega(defaultBodega || '');
    setLocationName('');
    setLocationDetail('');
    setPuntoReferencia('');
    setMetodoConteo('');
    setSubcategoria('');
    setObservaciones('');
    setSupervisorId(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventoryId || !assignedAdminId) {
      toast({
        title: 'Error',
        description: 'Faltan datos obligatorios para crear la ubicación',
        variant: 'destructive',
      });
      return;
    }
    if (isReadOnly) {
      toast({
        title: 'Inventario cerrado',
        description: 'No se pueden crear ubicaciones en un inventario histórico',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    const payload: NewLocationPayload = {
      master_reference: masterReference,
      inventory_id: inventoryId,
      location_name: locationName.trim() || null,
      location_detail: locationDetail.trim() || null,
      punto_referencia: puntoReferencia.trim() || null,
      metodo_conteo: metodoConteo.trim() || null,
      subcategoria: subcategoria.trim() || null,
      observaciones: observaciones.trim() || null,
      assigned_supervisor_id: supervisorId,
      assigned_admin_id: assignedAdminId,
      activo,
      terminado,
    };

    const { error } = await supabase.from('locations').insert(payload);
    setIsSaving(false);

    if (error) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la ubicación',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Ubicación creada', description: `Nueva ubicación para ${masterReference}` });
    handleClose();
    onSuccess?.();
  };

  const canSubmit = !!assignedAdminId && !isReadOnly;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar ubicación — {masterReference}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSuperadmin && (
            <div className="space-y-2">
              <Label htmlFor="bodega">Bodega *</Label>
              <Select value={bodega} onValueChange={(v) => setBodega(v as 'almacen' | 'planta')}>
                <SelectTrigger id="bodega">
                  <SelectValue placeholder="Seleccionar bodega" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="almacen">Almacén (MP)</SelectItem>
                  <SelectItem value="planta">Planta (PP)</SelectItem>
                </SelectContent>
              </Select>
              {!assignedAdminId && bodega && (
                <p className="text-xs text-destructive">
                  No hay un admin configurado para esta bodega.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location_name">Ubicación</Label>
              <Input
                id="location_name"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ej. Bodega 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location_detail">Detalle</Label>
              <Input
                id="location_detail"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder="Ej. Estante A"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="punto_referencia">Punto de referencia</Label>
              <Input
                id="punto_referencia"
                value={puntoReferencia}
                onChange={(e) => setPuntoReferencia(e.target.value)}
                placeholder="Ej. Cerca de la puerta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metodo_conteo">Método de conteo</Label>
              <Input
                id="metodo_conteo"
                value={metodoConteo}
                onChange={(e) => setMetodoConteo(e.target.value)}
                placeholder="Ej. Manual"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="subcategoria">Subcategoría</Label>
              <Input
                id="subcategoria"
                value={subcategoria}
                onChange={(e) => setSubcategoria(e.target.value)}
                placeholder="Ej. MP crítica"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Input
                id="observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas adicionales"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="activo">Activo</Label>
              <Switch id="activo" checked={activo} onCheckedChange={setActivo} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="terminado">Terminado</Label>
              <Switch id="terminado" checked={terminado} onCheckedChange={setTerminado} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Líder de conteo</Label>
            <SupervisorSelect
              value={supervisorId}
              onValueChange={setSupervisorId}
              placeholder="Sin asignar"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit || isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar ubicación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateLocationDialog;
