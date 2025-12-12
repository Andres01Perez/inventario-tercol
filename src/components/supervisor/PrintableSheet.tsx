import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface LocationItem {
  id: string;
  master_reference: string;
  location_name: string | null;
  location_detail: string | null;
}

interface PrintableSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operarioName: string;
  supervisorName: string;
  locations: LocationItem[];
}

const PrintableSheet: React.FC<PrintableSheetProps> = ({
  open,
  onOpenChange,
  operarioName,
  supervisorName,
  locations,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const today = new Date().toLocaleDateString('es-CO');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:border-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>Planilla de Conteo Físico</DialogTitle>
        </DialogHeader>

        {/* Printable Content */}
        <div className="print:p-4" id="printable-sheet">
          {/* Header */}
          <div className="text-center mb-6 border-b pb-4">
            <h1 className="text-2xl font-bold mb-1">PLANILLA DE CONTEO FÍSICO</h1>
            <p className="text-muted-foreground">Inventario Físico</p>
          </div>

          {/* Info Row */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <span className="font-medium">Operario:</span> {operarioName}
            </div>
            <div>
              <span className="font-medium">Fecha:</span> {today}
            </div>
            <div>
              <span className="font-medium">Supervisor:</span> {supervisorName}
            </div>
            <div>
              <span className="font-medium">Total Items:</span> {locations.length}
            </div>
          </div>

          {/* Table */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground">
                <th className="text-left py-2 px-2 w-12">#</th>
                <th className="text-left py-2 px-2">Referencia</th>
                <th className="text-left py-2 px-2">Ubicación</th>
                <th className="text-center py-2 px-2 w-32">Cantidad Contada</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc, index) => (
                <tr key={loc.id} className="border-b border-muted">
                  <td className="py-3 px-2">{index + 1}</td>
                  <td className="py-3 px-2 font-medium">{loc.master_reference}</td>
                  <td className="py-3 px-2">
                    {loc.location_name || '-'}
                    {loc.location_detail && ` - ${loc.location_detail}`}
                  </td>
                  <td className="py-3 px-2">
                    <div className="border-b border-dashed border-foreground h-6 w-full"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 mt-12 pt-8">
            <div className="text-center">
              <div className="border-b border-foreground mb-2 h-8"></div>
              <p className="text-sm text-muted-foreground">Firma Operario</p>
            </div>
            <div className="text-center">
              <div className="border-b border-foreground mb-2 h-8"></div>
              <p className="text-sm text-muted-foreground">Firma Supervisor</p>
            </div>
          </div>
        </div>

        {/* Print Button */}
        <div className="flex justify-end mt-4 print:hidden">
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintableSheet;
