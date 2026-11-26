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
}

export interface ValorizacionResumen {
  refs: number;
  totalInicial: number;
  totalAMontar: number;
  difNegativa: number;
  difPositiva: number;
  checkDiff: number;
  isConsistent: boolean;
}

export interface ValorizacionRiesgos {
  abiertasRefs: number;
  abiertasValorInicial: number;
  erpSinUbicRefs: number;
  descuadreSinCostoRefs: number;
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
    totalInicial,
    totalAMontar,
    difNegativa,
    difPositiva,
    checkDiff,
    isConsistent: Math.abs(checkDiff) < 0.01,
  };
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

export function exportValorizacionExcel(rows: ValorizacionRow[], inventoryName: string) {
  const matrix = buildMatrix(rows);
  const totalAlmacen = summarizeValorizacion(rows.filter((r) => r.bodega === 'almacen'));
  const totalPlanta = summarizeValorizacion(rows.filter((r) => r.bodega === 'planta'));
  const totalGeneral = summarizeValorizacion(rows);

  const resumenRows = [
    ...matrix.map((m) => ({
      Segmento: m.label,
      Referencias: m.resumen.refs,
      'TOTAL INV INICIAL': m.resumen.totalInicial,
      'TOTAL INV A MONTAR': m.resumen.totalAMontar,
      'COSTO DIF NEGATIVA': m.resumen.difNegativa,
      'COSTO DIF POSITIVA': m.resumen.difPositiva,
      'CONTROL CONSISTENCIA': m.resumen.checkDiff,
    })),
    {
      Segmento: 'Subtotal Almacén',
      Referencias: totalAlmacen.refs,
      'TOTAL INV INICIAL': totalAlmacen.totalInicial,
      'TOTAL INV A MONTAR': totalAlmacen.totalAMontar,
      'COSTO DIF NEGATIVA': totalAlmacen.difNegativa,
      'COSTO DIF POSITIVA': totalAlmacen.difPositiva,
      'CONTROL CONSISTENCIA': totalAlmacen.checkDiff,
    },
    {
      Segmento: 'Subtotal Planta',
      Referencias: totalPlanta.refs,
      'TOTAL INV INICIAL': totalPlanta.totalInicial,
      'TOTAL INV A MONTAR': totalPlanta.totalAMontar,
      'COSTO DIF NEGATIVA': totalPlanta.difNegativa,
      'COSTO DIF POSITIVA': totalPlanta.difPositiva,
      'CONTROL CONSISTENCIA': totalPlanta.checkDiff,
    },
    {
      Segmento: 'TOTAL GENERAL',
      Referencias: totalGeneral.refs,
      'TOTAL INV INICIAL': totalGeneral.totalInicial,
      'TOTAL INV A MONTAR': totalGeneral.totalAMontar,
      'COSTO DIF NEGATIVA': totalGeneral.difNegativa,
      'COSTO DIF POSITIVA': totalGeneral.difPositiva,
      'CONTROL CONSISTENCIA': totalGeneral.checkDiff,
    },
  ];

  const detalleRows = rows.map((r) => ({
    referencia: r.referencia,
    familia: r.familia,
    bodega: r.bodega === 'almacen' ? 'Almacén' : 'Planta',
    control: r.control ?? '',
    erp_bodega: r.erp_bodega,
    costo_u: r.costo_u,
    sin_costo: r.sin_costo ? 'SI' : 'NO',
    cant_a_montar: r.cant_a_montar,
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