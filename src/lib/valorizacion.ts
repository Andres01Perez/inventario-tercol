import * as XLSX from 'xlsx';

export type ValorizacionBodega = 'almacen' | 'planta';
export type ValorizacionFamilia = 'MP' | 'PP';

export interface ValorizacionRow {
  referencia: string;
  familia: ValorizacionFamilia;
  bodega: ValorizacionBodega;
  control: string | null;
  erp_bodega: number;
  costo_u: number;
  sin_costo: boolean;
  cant_a_montar: number;
  estado: string;
  num_ubicaciones: number;
  valor_inicial: number;
  valor_a_montar: number;
  dif_valor: number;
  cant_validada_inactivas: number;
  origen?: 'validado' | 'ajuste_cierre';
  motivo_ajuste?: string | null;
  soporte_ajuste?: string | null;
}

export interface ValorizacionResumenRow {
  familia: ValorizacionFamilia;
  bodega: ValorizacionBodega;
  referencias: number;
  total_inv_inicial: number;
  total_inv_a_montar: number;
  costo_dif_negativa: number;
  costo_dif_positiva: number;
  valor_ajustes_cierre?: number;
}

export interface ValorizacionResumen {
  refs: number;
  totalInicial: number;
  totalAMontar: number;
  difNegativa: number;
  difPositiva: number;
  checkDiff: number;
  isConsistent: boolean;
  valorAjustes: number;
}

export interface ValorizacionRiesgos {
  abiertasRefs: number;
  abiertasValorInicial: number;
  erpSinUbicRefs: number;
  descuadreSinCostoRefs: number;
}

export interface ValorizacionIntegrity {
  loadedCount: number;
  expectedCount: number;
  detailDifSum: number;
  serverNetDiff: number;
  valueDiff: number;
  countOk: boolean;
  valueOk: boolean;
  isOk: boolean;
}

const OPEN_STATUSES = new Set(['pendiente', 'conflicto', 'critico']);

export function summarizeValorizacion(rows: ValorizacionRow[]): ValorizacionResumen {
  let totalInicial = 0;
  let totalAMontar = 0;
  let difNegativa = 0;
  let difPositiva = 0;

  for (const r of rows) {
    totalInicial += r.valor_inicial;
    totalAMontar += r.valor_a_montar;
    if (r.dif_valor < 0) difNegativa += r.dif_valor;
    else if (r.dif_valor > 0) difPositiva += r.dif_valor;
  }

  const checkDiff = (totalAMontar - totalInicial) - (difNegativa + difPositiva);
  return {
    refs: rows.length,
    valorAjustes: rows.reduce((s, r) => s + (r.origen === 'ajuste_cierre' ? r.valor_a_montar : 0), 0),
    totalInicial,
    totalAMontar,
    difNegativa,
    difPositiva,
    checkDiff,
    isConsistent: Math.abs(checkDiff) < 0.01,
  };
}

export function summarizeFromServer(
  rows: ValorizacionResumenRow[],
  bodega: ValorizacionBodega | 'all' = 'all',
  familia: ValorizacionFamilia | 'all' = 'all'
): ValorizacionResumen {
  let refs = 0;
  let totalInicial = 0;
  let totalAMontar = 0;
  let difNegativa = 0;
  let difPositiva = 0;

  for (const r of rows) {
    if (bodega !== 'all' && r.bodega !== bodega) continue;
    if (familia !== 'all' && r.familia !== familia) continue;
    refs += r.referencias;
    totalInicial += r.total_inv_inicial;
    totalAMontar += r.total_inv_a_montar;
    difNegativa += r.costo_dif_negativa;
    difPositiva += r.costo_dif_positiva;
  }

  const checkDiff = (totalAMontar - totalInicial) - (difNegativa + difPositiva);
  return {
    refs,
    valorAjustes: rows.filter(r => (bodega === 'all' || r.bodega === bodega) && (familia === 'all' || r.familia === familia)).reduce((s, r) => s + (r.valor_ajustes_cierre ?? 0), 0),
    totalInicial,
    totalAMontar,
    difNegativa,
    difPositiva,
    checkDiff,
    isConsistent: Math.abs(checkDiff) < 0.01,
  };
}

export function buildMatrixFromServer(rows: ValorizacionResumenRow[]) {
  const buckets: { label: string; bodega: ValorizacionBodega; familia: ValorizacionFamilia }[] = [
    { label: 'Almacén · MP', bodega: 'almacen', familia: 'MP' },
    { label: 'Almacén · PP', bodega: 'almacen', familia: 'PP' },
    { label: 'Planta · MP', bodega: 'planta', familia: 'MP' },
    { label: 'Planta · PP', bodega: 'planta', familia: 'PP' },
  ];
  return buckets.map((b) => ({
    ...b,
    resumen: summarizeFromServer(rows, b.bodega, b.familia),
  }));
}

export function checkValorizacionIntegrity(
  detailRows: ValorizacionRow[],
  resumenRows: ValorizacionResumenRow[]
): ValorizacionIntegrity {
  const loadedCount = detailRows.length;
  const expectedCount = resumenRows.reduce((s, r) => s + r.referencias, 0);
  const detailDifSum = detailRows.reduce((s, r) => s + r.dif_valor, 0);
  const serverNetDiff = resumenRows.reduce(
    (s, r) => s + (r.total_inv_a_montar - r.total_inv_inicial),
    0
  );
  const valueDiff = detailDifSum - serverNetDiff;
  const countOk = loadedCount === expectedCount;
  const valueOk = Math.abs(valueDiff) <= 1;
  return {
    loadedCount,
    expectedCount,
    detailDifSum,
    serverNetDiff,
    valueDiff,
    countOk,
    valueOk,
    isOk: countOk && valueOk,
  };
}

export function sortDetailForExport(rows: ValorizacionRow[]): ValorizacionRow[] {
  return [...rows].sort(
    (a, b) =>
      a.familia.localeCompare(b.familia) ||
      a.bodega.localeCompare(b.bodega) ||
      a.referencia.localeCompare(b.referencia)
  );
}

export function computeRisks(rows: ValorizacionRow[]): ValorizacionRiesgos {
  let abiertasRefs = 0;
  let abiertasValorInicial = 0;
  let erpSinUbicRefs = 0;
  let descuadreSinCostoRefs = 0;

  for (const r of rows) {
    if (OPEN_STATUSES.has(r.estado)) {
      abiertasRefs += 1;
      abiertasValorInicial += r.valor_inicial;
    }
    if (r.erp_bodega > 0 && r.num_ubicaciones === 0) {
      erpSinUbicRefs += 1;
    }
    if (r.sin_costo && r.cant_a_montar !== r.erp_bodega) {
      descuadreSinCostoRefs += 1;
    }
  }

  return { abiertasRefs, abiertasValorInicial, erpSinUbicRefs, descuadreSinCostoRefs };
}

export function buildMatrix(rows: ValorizacionRow[]) {
  const buckets: { label: string; bodega: ValorizacionBodega | 'all'; familia: ValorizacionFamilia | 'all' }[] = [
    { label: 'Almacén · MP', bodega: 'almacen', familia: 'MP' },
    { label: 'Almacén · PP', bodega: 'almacen', familia: 'PP' },
    { label: 'Planta · MP', bodega: 'planta', familia: 'MP' },
    { label: 'Planta · PP', bodega: 'planta', familia: 'PP' },
  ];
  return buckets.map((b) => ({
    ...b,
    resumen: summarizeValorizacion(
      rows.filter((r) => r.bodega === b.bodega && r.familia === b.familia)
    ),
  }));
}

export function exportValorizacionExcel(
  rows: ValorizacionRow[],
  resumenServerRows: ValorizacionResumenRow[],
  inventoryName: string
) {
  const matrix = buildMatrixFromServer(resumenServerRows);
  const totalAlmacen = summarizeFromServer(resumenServerRows, 'almacen', 'all');
  const totalPlanta = summarizeFromServer(resumenServerRows, 'planta', 'all');
  const totalGeneral = summarizeFromServer(resumenServerRows, 'all', 'all');

  const resumenRows = [
    ...matrix.map((m) => ({
      Segmento: m.label,
      Referencias: m.resumen.refs,
      'TOTAL INV INICIAL': m.resumen.totalInicial,
      'TOTAL INV A MONTAR': m.resumen.totalAMontar,
      'VALOR AJUSTES DE CIERRE': m.resumen.valorAjustes,
      'COSTO DIF NEGATIVA': m.resumen.difNegativa,
      'COSTO DIF POSITIVA': m.resumen.difPositiva,
      'CONTROL CONSISTENCIA': m.resumen.checkDiff,
    })),
    {
      Segmento: 'Subtotal Almacén',
      Referencias: totalAlmacen.refs,
      'TOTAL INV INICIAL': totalAlmacen.totalInicial,
      'TOTAL INV A MONTAR': totalAlmacen.totalAMontar,
      'VALOR AJUSTES DE CIERRE': totalAlmacen.valorAjustes,
      'COSTO DIF NEGATIVA': totalAlmacen.difNegativa,
      'COSTO DIF POSITIVA': totalAlmacen.difPositiva,
      'CONTROL CONSISTENCIA': totalAlmacen.checkDiff,
    },
    {
      Segmento: 'Subtotal Planta',
      Referencias: totalPlanta.refs,
      'TOTAL INV INICIAL': totalPlanta.totalInicial,
      'TOTAL INV A MONTAR': totalPlanta.totalAMontar,
      'VALOR AJUSTES DE CIERRE': totalPlanta.valorAjustes,
      'COSTO DIF NEGATIVA': totalPlanta.difNegativa,
      'COSTO DIF POSITIVA': totalPlanta.difPositiva,
      'CONTROL CONSISTENCIA': totalPlanta.checkDiff,
    },
    {
      Segmento: 'TOTAL GENERAL',
      Referencias: totalGeneral.refs,
      'TOTAL INV INICIAL': totalGeneral.totalInicial,
      'TOTAL INV A MONTAR': totalGeneral.totalAMontar,
      'VALOR AJUSTES DE CIERRE': totalGeneral.valorAjustes,
      'COSTO DIF NEGATIVA': totalGeneral.difNegativa,
      'COSTO DIF POSITIVA': totalGeneral.difPositiva,
      'CONTROL CONSISTENCIA': totalGeneral.checkDiff,
    },
  ];

  const detalleRows = sortDetailForExport(rows).map((r) => ({
    referencia: r.referencia,
    familia: r.familia,
    bodega: r.bodega === 'almacen' ? 'Almacén' : 'Planta',
    control: r.control ?? '',
    erp_bodega: r.erp_bodega,
    costo_u: r.costo_u,
    sin_costo: r.sin_costo ? 'SI' : 'NO',
    cant_a_montar: r.cant_a_montar,
    cant_validada_inactivas: r.cant_validada_inactivas,
    origen: r.origen ?? 'validado',
    motivo_ajuste: r.motivo_ajuste ?? '',
    soporte_ajuste: r.soporte_ajuste ?? '',
    estado: r.estado,
    num_ubicaciones: r.num_ubicaciones,
    valor_inicial: r.valor_inicial,
    valor_a_montar: r.valor_a_montar,
    dif_valor: r.dif_valor,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleRows), 'Detalle');

  const safeName = (inventoryName || 'Inventario').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Valorizacion_${safeName}_${date}.xlsx`);
}