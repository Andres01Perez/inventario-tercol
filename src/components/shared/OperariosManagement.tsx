import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  UserCog, 
  Search, 
  Plus,
  Loader2,
  Edit2,
  Trash2,
  Check,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Operario {
  id: string;
  full_name: string;
  turno: number | null;
  is_active: boolean;
  created_at: string;
}

const OperariosManagement: React.FC = () => {
  const [operarios, setOperarios] = useState<Operario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOperario, setEditingOperario] = useState<Operario | null>(null);
  const [formData, setFormData] = useState({ full_name: '', turno: 1 });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchOperarios = async () => {
    try {
      const { data, error } = await supabase
        .from('operarios')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setOperarios(data || []);
    } catch (error) {
      console.error('Error fetching operarios:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los operarios',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperarios();
  }, []);

  const handleOpenDialog = (operario?: Operario) => {
    if (operario) {
      setEditingOperario(operario);
      setFormData({
        full_name: operario.full_name,
        turno: operario.turno || 1,
      });
    } else {
      setEditingOperario(null);
      setFormData({ full_name: '', turno: 1 });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre es requerido',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      if (editingOperario) {
        // Update
        const { error } = await supabase
          .from('operarios')
          .update({
            full_name: formData.full_name.trim(),
            turno: formData.turno,
          })
          .eq('id', editingOperario.id);

        if (error) throw error;

        setOperarios(prev => prev.map(o => 
          o.id === editingOperario.id 
            ? { ...o, full_name: formData.full_name.trim(), turno: formData.turno }
            : o
        ));

        toast({ title: 'Operario actualizado' });
      } else {
        // Create
        const { data, error } = await supabase
          .from('operarios')
          .insert({
            full_name: formData.full_name.trim(),
            turno: formData.turno,
          })
          .select()
          .single();

        if (error) throw error;

        setOperarios(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
        toast({ title: 'Operario creado' });
      }

      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving operario:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el operario',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (operario: Operario) => {
    try {
      const { error } = await supabase
        .from('operarios')
        .update({ is_active: !operario.is_active })
        .eq('id', operario.id);

      if (error) throw error;

      setOperarios(prev => prev.map(o => 
        o.id === operario.id ? { ...o, is_active: !o.is_active } : o
      ));

      toast({
        title: operario.is_active ? 'Operario desactivado' : 'Operario activado',
      });
    } catch (error) {
      console.error('Error toggling operario:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (operario: Operario) => {
    if (!confirm(`¿Estás seguro de eliminar a ${operario.full_name}?`)) return;

    try {
      const { error } = await supabase
        .from('operarios')
        .delete()
        .eq('id', operario.id);

      if (error) throw error;

      setOperarios(prev => prev.filter(o => o.id !== operario.id));
      toast({ title: 'Operario eliminado' });
    } catch (error) {
      console.error('Error deleting operario:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el operario. Puede estar asignado a tareas.',
        variant: 'destructive',
      });
    }
  };

  const filteredOperarios = operarios.filter(operario => {
    const searchLower = searchTerm.toLowerCase();
    return operario.full_name.toLowerCase().includes(searchLower);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Gestión de Operarios</h2>
          <p className="text-sm text-muted-foreground">
            Administra los operarios que pueden ser asignados a tareas de conteo
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar operario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingOperario ? 'Editar Operario' : 'Nuevo Operario'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre Completo *</Label>
                  <Input
                    id="full_name"
                    placeholder="Ej: Juan Pérez"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="turno">Turno *</Label>
                  <Select
                    value={formData.turno.toString()}
                    onValueChange={(val) => setFormData(prev => ({ ...prev, turno: parseInt(val) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar turno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Turno 1</SelectItem>
                      <SelectItem value="2">Turno 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingOperario ? 'Guardar Cambios' : 'Crear Operario'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredOperarios.length === 0 ? (
        <div className="glass-card text-center py-12">
          <UserCog className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No se encontraron operarios' : 'No hay operarios registrados'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Agrega operarios para poder asignarlos a tareas de conteo
          </p>
        </div>
      ) : (
        <div className="glass-card p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOperarios.map((operario) => (
                <TableRow key={operario.id}>
                  <TableCell className="font-medium text-foreground">
                    {operario.full_name}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className="bg-blue-500/10 text-blue-500 border-blue-500/30"
                    >
                      T{operario.turno || 1}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={operario.is_active 
                        ? 'bg-green-500/10 text-green-500 border-green-500/30' 
                        : 'bg-muted text-muted-foreground'
                      }
                    >
                      {operario.is_active ? (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Activo
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3 mr-1" />
                          Inactivo
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={operario.is_active}
                        onCheckedChange={() => handleToggleActive(operario)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(operario)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(operario)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default OperariosManagement;