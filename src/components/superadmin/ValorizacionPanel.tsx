import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '@/contexts/InventoryContext';
import { useValorizacion, useValorizacionResumen } from '@/hooks/useValorizacion';
import {
  buildMatrixFromServer,
  checkValorizacionIntegrity,
  computeRisks,
  exportValorizacionExcel,
  summarizeFromServer,
  ValorizacionBodega,
  ValorizacionFamilia,
} from '@/lib/valorizacion';
import { descuadreColorClass, formatMoney, formatQty, formatSignedMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownUp, CheckCircle2, Download, AlertTriangle, Search } from 'lucide-react';

type BodegaFilter = 'all' | ValorizacionBodega;
type FamiliaFilter = 'all' | ValorizacionFamilia;
type SignFilter = 'all' | 'neg' | 'pos' | 'zero';

const ValorizacionPanel: React.FC = () => {
  const navigate = useNavigate();
  const { inventoryId, inventory } = useInventory();
  const { data: rows = [], isLoading, error } = useValorizacion(inventoryId);
  const {
    data: resumenRows = [],
    isLoading: isLoadingResumen,
    error: errorResumen,
  } = useValorizacionResumen(inventoryId);

  const [bodega, setBodega] = useState<BodegaFilter>('all');
  const [familia, setFamilia] = useState<FamiliaFilter>('all');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('all');
  const [signo, setSigno] = useState<SignFilter>('all');
  const [sortAsc, setSortAsc] = useState(false);

  const scopedRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (bodega === 'all' || r.bodega === bodega) &&
          (familia === 'all' || r.familia === familia)
      ),
    [rows, bodega, familia]
  );

  const resumen = useMemo(
    () => summarizeFromServer(resumenRows, bodega, familia),
    [resumenRows, bodega, familia]
  );
  const matrix = useMemo(() => buildMatrixFromServer(resumenRows), [resumenRows]);
  const integrity = useMemo(
    () => checkValorizacionIntegrity(rows, resumenRows),
    [rows, resumenRows]
  );
  const risks = useMemo(() => computeRisks(scopedRows), [scopedRows]);

  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = scopedRows.filter((r) => {
      if (q && !r.referencia.toLowerCase().includes(q)) return false;
      if (estado !== 'all' && r.estado !== estado) return false;
      if (signo === 'neg' && !(r.dif_valor < 0)) return false;
      if (signo === 'pos' && !(r.dif_valor > 0)) return false;
      if (signo === 'zero' && r.dif_valor !== 0) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortAsc
        ? Math.abs(a.dif_valor) - Math.abs(b.dif_valor)
        : Math.abs(b.dif_valor) - Math.abs(a.dif_valor)
    );
  }, [scopedRows, search, estado, signo, sortAsc]);

  if (isLoading || isLoadingResumen) return <div className="glass-card p-6 text-sm text-muted-foreground">Calculando valorización...</div>;
  const loadError = error || errorResumen;
  if (loadError) return <div className="glass-card p-6 text-sm text-destructive">Error al cargar valorización: {(loadError as Error).message}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={bodega} onValueChange={(v) => setBodega(v as BodegaFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Bodega" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ambas bodegas</SelectItem>
              <SelectItem value="almacen">Almacén</SelectItem>
              <SelectItem value="planta">Planta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={familia} onValueChange={(v) => setFamilia(v as FamiliaFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Familia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas (MP/PP)</SelectItem>
              <SelectItem value="MP">MP</SelectItem>
              <SelectItem value="PP">PP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportValorizacionExcel(rows, resumenRows, inventory?.nombre ?? 'Inventario')}
          disabled={rows.length === 0 || !integrity.isOk}
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      <div
        className={`glass-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
          !integrity.isOk ? 'border-red-500/60 bg-red-500/10' : ''
        }`}
      >
        <span className="font-medium">
          Filas cargadas {integrity.loadedCount} de {integrity.expectedCount}
        </span>
        {integrity.isOk ? (
          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Detalle y resumen completos
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
            <AlertTriangle className="w-4 h-4" />
            {!integrity.countOk
              ? `Faltan filas por cargar (${integrity.loadedCount} ≠ ${integrity.expectedCount}). Exportación deshabilitada.`
              : `Descuadre entre detalle y resumen (${formatSignedMoney(integrity.valueDiff)}). Exportación deshabilitada.`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">TOTAL INV INICIAL</p>
          <p className="text-xl font-bold mt-1">{formatMoney(resumen.totalInicial)}</p>
          <p className="text-xs text-muted-foreground mt-1">{resumen.refs} referencias</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">TOTAL INV A MONTAR</p>
          <p className="text-xl font-bold mt-1">{formatMoney(resumen.totalAMontar)}</p>
          <p className="text-xs text-muted-foreground mt-1">De ajustes de cierre: {formatMoney(resumen.valorAjustes)}</p>
          <p className={`text-xs mt-1 ${descuadreColorClass(resumen.totalAMontar - resumen.totalInicial)}`}>
            Neto: {formatSignedMoney(resumen.totalAMontar - resumen.totalInicial)}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">COSTO DIF NEGATIVA</p>
          <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">{formatSignedMoney(resumen.difNegativa)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">COSTO DIF POSITIVA</p>
          <p className="text-xl font-bold mt-1 text-green-600 dark:text-green-400">{formatSignedMoney(resumen.difPositiva)}</p>
        </div>
      </div>

      <div className="glass-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Control: A MONTAR − INICIAL = NEGATIVA + POSITIVA</span>
        {resumen.isConsistent ? (
          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Consistente
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
            <AlertTriangle className="w-4 h-4" /> Diferencia: {formatSignedMoney(resumen.checkDiff)}
          </span>
        )}
      </div>

      <div className="glass-card p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold mb-3">Matriz por Bodega y Familia</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Segmento</TableHead>
              <TableHead className="text-right">Refs</TableHead>
              <TableHead className="text-right">Inv. Inicial</TableHead>
              <TableHead className="text-right">Inv. a Montar</TableHead>
              <TableHead className="text-right">De ajustes</TableHead>
              <TableHead className="text-right">Dif. Negativa</TableHead>
              <TableHead className="text-right">Dif. Positiva</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.map((m) => (
              <TableRow key={m.label}>
                <TableCell className="font-medium">{m.label}</TableCell>
                <TableCell className="text-right">{m.resumen.refs}</TableCell>
                <TableCell className="text-right">{formatMoney(m.resumen.totalInicial)}</TableCell>
                <TableCell className="text-right">{formatMoney(m.resumen.totalAMontar)}</TableCell>
                <TableCell className="text-right">{formatMoney(m.resumen.valorAjustes)}</TableCell>
                <TableCell className="text-right text-red-600 dark:text-red-400">{formatSignedMoney(m.resumen.difNegativa)}</TableCell>
                <TableCell className="text-right text-green-600 dark:text-green-400">{formatSignedMoney(m.resumen.difPositiva)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Referencias aún abiertas (pendiente / conflicto / crítico)</p>
          <p className="text-lg font-semibold mt-1">{risks.abiertasRefs} refs · {formatMoney(risks.abiertasValorInicial)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">ERP &gt; 0 sin ubicaciones en bodega</p>
          <p className="text-lg font-semibold mt-1">{risks.erpSinUbicRefs} refs</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Descuadre sin costo unitario</p>
          <p className="text-lg font-semibold mt-1">{risks.descuadreSinCostoRefs} refs</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar referencia..." className="pl-9" />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="auditado">Auditado</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="conflicto">Conflicto</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
              <SelectItem value="cerrado_forzado">Cerrado forzado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={signo} onValueChange={(v) => setSigno(v as SignFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Diferencia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las dif.</SelectItem>
              <SelectItem value="neg">Negativa (−)</SelectItem>
              <SelectItem value="pos">Positiva (+)</SelectItem>
              <SelectItem value="zero">Sin diferencia (0)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setSortAsc((s) => !s)}>
            <ArrowDownUp className="w-4 h-4 mr-1.5" />
            |Dif. valor| {sortAsc ? '↑' : '↓'}
          </Button>
        </div>

        <div className="overflow-x-auto max-h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Fam.</TableHead>
                <TableHead>Bodega</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Origen / soporte</TableHead>
                <TableHead className="text-right">ERP</TableHead>
                <TableHead className="text-right">A montar</TableHead>
                <TableHead className="text-right">Costo u.</TableHead>
                <TableHead className="text-right">Valor inicial</TableHead>
                <TableHead className="text-right">Valor a montar</TableHead>
                <TableHead className="text-right">Dif. valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.slice(0, 300).map((r) => (
                <TableRow
                  key={`${r.bodega}-${r.referencia}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/superadmin/auditoria/${r.bodega}?q=${encodeURIComponent(r.referencia)}&familia=${r.familia}`)}
                >
                  <TableCell className="font-medium break-all">{r.referencia}</TableCell>
                  <TableCell>{r.familia}</TableCell>
                  <TableCell>{r.bodega === 'almacen' ? 'Almacén' : 'Planta'}</TableCell>
                  <TableCell><Badge variant="outline">{r.estado}</Badge></TableCell>
                  <TableCell title={`${r.motivo_ajuste ?? ''}\n${r.soporte_ajuste ?? ''}`}><Badge variant="outline">{r.origen === 'ajuste_cierre' ? 'Ajuste de cierre' : 'Validado'}</Badge>{r.motivo_ajuste && <p className="text-xs text-muted-foreground">{r.motivo_ajuste}</p>}</TableCell>
                  <TableCell className="text-right">{formatQty(r.erp_bodega)}</TableCell>
                  <TableCell className="text-right">{formatQty(r.cant_a_montar)}</TableCell>
                  <TableCell className="text-right">{r.sin_costo ? <span className="text-amber-600">Sin costo</span> : formatMoney(r.costo_u)}</TableCell>
                  <TableCell className="text-right">{formatMoney(r.valor_inicial)}</TableCell>
                  <TableCell className="text-right">{formatMoney(r.valor_a_montar)}</TableCell>
                  <TableCell className={`text-right font-medium ${descuadreColorClass(r.dif_valor)}`}>{formatSignedMoney(r.dif_valor)}</TableCell>
                </TableRow>
              ))}
              {tableRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">Sin resultados con los filtros actuales.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {tableRows.length > 300 && (
          <p className="text-xs text-muted-foreground">Mostrando las primeras 300 de {tableRows.length} referencias. Usa la búsqueda o exporta a Excel para ver todas.</p>
        )}
      </div>
    </div>
  );
};

export default ValorizacionPanel;