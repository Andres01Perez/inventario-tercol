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
  subcategoria: string | null;
  observaciones: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  inventory_master?: { referencia: string; material_type: string } | null;
}

interface PrintableSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneName: string;
  supervisorName: string;
  locations: LocationItem[];
  roundNumber?: 1 | 2 | 3 | 4 | 5;
}

const getRoundLabel = (roundNumber?: number) => {
  switch (roundNumber) {
    case 1: return 'Conteo 1 (Turno 1)';
    case 2: return 'Conteo 2 (Turno 2)';
    case 3: return 'Conteo 3 (Desempate)';
    case 4: return 'Conteo 4 (Final)';
    case 5: return 'Conteo 5 (Crítico)';
    default: return 'Conteo Físico';
  }
};

const PrintableSheet: React.FC<PrintableSheetProps> = ({
  open,
  onOpenChange,
  zoneName,
  supervisorName,
  locations,
  roundNumber,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const today = new Date().toLocaleDateString('es-CO');
  const roundLabel = getRoundLabel(roundNumber);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:fixed print:inset-0 print:max-w-none print:max-h-none print:overflow-visible print:h-auto print:w-full print:shadow-none print:border-none print:bg-white">
        <DialogHeader className="print:hidden">
          <DialogTitle>Planilla de Conteo Físico - {roundLabel}</DialogTitle>
        </DialogHeader>

        {/* Printable Content */}
        <div className="print:p-4 print:block" id="printable-sheet">
          {/* Table with header info in thead and signatures in tfoot */}
          <table className="w-full border-collapse text-xs print:text-[10px]">
            <thead className="print:table-header-group">
              {/* Header info row - repeats on each page */}
              <tr>
                <th colSpan={9} className="pb-4 border-b-0 text-left font-normal">
                  <div className="text-center mb-4">
                    <h1 className="text-xl font-bold">PLANILLA DE CONTEO FÍSICO</h1>
                    <p className="text-base font-medium text-primary">{roundLabel}</p>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span><strong>Zona:</strong> {zoneName}</span>
                    <span><strong>Fecha:</strong> {today}</span>
                    <span><strong>Supervisor:</strong> {supervisorName}</span>
                    <span><strong>Total:</strong> {locations.length} items</span>
                  </div>
                </th>
              </tr>
              {/* Column headers row */}
              <tr className="border-b-2 border-t border-foreground">
                <th className="text-left py-2 px-1 w-8">#</th>
                <th className="text-left py-2 px-1">Tipo</th>
                <th className="text-left py-2 px-1">Referencia</th>
                <th className="text-left py-2 px-1">Subcat.</th>
                <th className="text-left py-2 px-1">Observaciones</th>
                <th className="text-left py-2 px-1">Ubicación</th>
                <th className="text-left py-2 px-1">Ubic. Det.</th>
                <th className="text-left py-2 px-1">Método</th>
                <th className="text-center py-2 px-1 w-20">Cantidad</th>
              </tr>
            </thead>
            
            {/* Signatures footer - repeats on each page */}
            <tfoot className="print:table-footer-group">
              <tr>
                <td colSpan={9} className="pt-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="text-center">
                      <div className="border-b border-foreground mb-2 h-6"></div>
                      <p className="text-xs text-muted-foreground">Firma Responsable</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-foreground mb-2 h-6"></div>
                      <p className="text-xs text-muted-foreground">Firma Supervisor</p>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
            
            <tbody>
              {locations.map((loc, index) => (
                <tr key={loc.id} className="border-b border-muted print:break-inside-avoid">
                  <td className="py-2 px-1">{index + 1}</td>
                  <td className="py-2 px-1">{loc.inventory_master?.material_type || '-'}</td>
                  <td className="py-2 px-1 font-medium">{loc.master_reference}</td>
                  <td className="py-2 px-1">{loc.subcategoria || '-'}</td>
                  <td className="py-2 px-1 text-xs max-w-[100px] truncate">{loc.observaciones || '-'}</td>
                  <td className="py-2 px-1">{loc.location_name || '-'}</td>
                  <td className="py-2 px-1">{loc.location_detail || '-'}</td>
                  <td className="py-2 px-1">{loc.metodo_conteo || '-'}</td>
                  <td className="py-2 px-1">
                    <div className="border-b border-dashed border-foreground h-5 w-full"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
