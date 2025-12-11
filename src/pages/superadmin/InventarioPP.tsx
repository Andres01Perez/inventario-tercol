import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Boxes, 
  ArrowLeft, 
  Search, 
  RefreshCw,
  AlertCircle
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
import { useToast } from '@/hooks/use-toast';
import EditableCell from '@/components/shared/EditableCell';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 20;

const InventarioPP: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-pp', searchTerm, currentPage],
    queryFn: async () => {
      let query = supabase
        .from('inventory_master')
        .select('*', { count: 'exact' })
        .eq('material_type', 'PP')
        .order('referencia');

      if (searchTerm) {
        query = query.ilike('referencia', `%${searchTerm}%`);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { items: data || [], total: count || 0 };
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ referencia, field, value }: { referencia: string; field: string; value: string }) => {
      const updateData: Record<string, unknown> = {};
      // Handle numeric fields
      const numericFields = ['cant_pld', 'cant_plr', 'cant_za', 'cant_prov_pp', 'cant_total_pp', 'cant_alm_pp', 'costo_u_pp', 'mp_costo', 'mo_costo', 'servicio', 'costo_t'];
      if (numericFields.includes(field)) {
        updateData[field] = value === '' ? null : parseFloat(value);
      } else {
        updateData[field] = value === '' ? null : value;
      }

      const { error } = await supabase
        .from('inventory_master')
        .update(updateData)
        .eq('referencia', referencia);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-pp'] });
      toast({ title: 'Guardado', description: 'Campo actualizado correctamente' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'No se pudo guardar el cambio', variant: 'destructive' });
      console.error('Update error:', error);
    }
  });

  const handleSave = async (referencia: string, field: string, value: string) => {
    await updateMutation.mutateAsync({ referencia, field, value });
  };

  const totalPages = Math.ceil((data?.total || 0) / ITEMS_PER_PAGE);

  const columns = [
    { key: 'referencia', label: 'Referencia', editable: false },
    { key: 'cant_pld', label: 'Cant. PLD', editable: true, type: 'number' as const },
    { key: 'cant_plr', label: 'Cant. PLR', editable: true, type: 'number' as const },
    { key: 'cant_za', label: 'Cant. ZA', editable: true, type: 'number' as const },
    { key: 'cant_prov_pp', label: 'Cant. Prov', editable: true, type: 'number' as const },
    { key: 'cant_total_pp', label: 'Cant. Total', editable: true, type: 'number' as const },
    { key: 'costo_u_pp', label: 'Costo Unit.', editable: true, type: 'number' as const },
    { key: 'costo_t', label: 'Costo Total', editable: true, type: 'number' as const },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Boxes className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Inventario Producto en Proceso</h1>
                <p className="text-xs text-muted-foreground">CRUD completo - Doble clic para editar</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">Superadmin</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="border-b border-border bg-card/50 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-full mx-auto flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {data?.total || 0} referencias
          </span>
        </div>
      </div>

      {/* Table */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay referencias de PP</p>
              <p className="text-sm text-muted-foreground">Importa la maestra desde el panel de superadmin</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col.key} className="whitespace-nowrap">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((item) => (
                    <TableRow key={item.referencia}>
                      {columns.map((col) => (
                        <TableCell key={col.key} className="py-1">
                          {col.editable ? (
                            <EditableCell
                              value={item[col.key as keyof typeof item] as string | number | null}
                              onSave={(value) => handleSave(item.referencia, col.key, value)}
                              type={col.type}
                            />
                          ) : (
                            <span className="font-medium">{item[col.key as keyof typeof item] as string}</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border p-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page > totalPages) return null;
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={page === currentPage}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default InventarioPP;
