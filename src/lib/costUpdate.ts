import * as XLSX from 'xlsx';

export type CostMaterialType = 'MP' | 'PP';

export interface ParsedCostRow {
  excelRow: number;
  rawRef: string;
  refNorm: string;
  rawCost: unknown;
  costoNuevo: number | null;
  invalidReason: string | null;
}

export interface MasterCostRecord {
  referencia: string;
  costoActual: number | null;
  cantTotal: number;
  costoTActual: number | null;
}

export interface CostUpdateItem {
  excelRow: number;
  referencia: string;
  refNorm: string;
  costoActual: number | null;
  costoNuevo: number;
  varPct: number | null;
  cantTotal: number;
  costoTActual: number | null;
  costoTNuevo: number;
  changed: boolean;
}

export interface CostDuplicateItem {
  refNorm: string;
  rows: number[];
  values: string[];
}

export interface CostNotFoundItem {
  excelRow: number;
  referencia: string;
  costoNuevo: number;
}

export interface CostInvalidItem {
  excelRow: number;
  rawRef: string;
  rawCost: string;
  reason: string;
}

export interface CostUpdatePreview {
  totalRows: number;
  toUpdate: CostUpdateItem[];
  unchanged: CostUpdateItem[];
  notFound: CostNotFoundItem[];
  duplicates: CostDuplicateItem[];
  invalid: CostInvalidItem[];
}

export function normalizeRef(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const REF_HEADERS = new Set(['referencia', 'ref', 'codigo', 'cod']);
const COST_HEADERS = new Set([
  'costou',
  'costounitario',
  'costounit',
  'costo',
  'costoump',
  'costoupp',
]);

export function parseCostValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const cleaned = String(raw).trim().replace(/\$/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;

  // Detecta formato con separadores de miles/decimales
  let normalized = cleaned;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1] !== undefined && parts[1].length <= 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseCostUpdateExcel(buffer: ArrayBuffer): {
  rows: ParsedCostRow[];
  error: string | null;
} {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], error: 'El archivo Excel no contiene hojas.' };
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], error: 'No se pudo leer la primera hoja del archivo.' };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (grid.length < 2) {
    return { rows: [], error: 'El archivo debe tener encabezados y al menos una fila de datos.' };
  }

  const headerRow = grid[0] ?? [];
  let refCol = -1;
  let costCol = -1;

  headerRow.forEach((cell, idx) => {
    const h = normalizeHeader(cell);
    if (refCol === -1 && REF_HEADERS.has(h)) refCol = idx;
    if (costCol === -1 && COST_HEADERS.has(h)) costCol = idx;
  });

  if (refCol === -1 || costCol === -1) {
    return {
      rows: [],
      error: 'No se encontraron las columnas requeridas: Referencia y CostoU.',
    };
  }

  const rows: ParsedCostRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rawRefVal = row[refCol];
    const rawCostVal = row[costCol];
    const rawRef = String(rawRefVal ?? '').trim();
    const rawCostStr = String(rawCostVal ?? '').trim();

    if (!rawRef && !rawCostStr) continue;

    const refNorm = normalizeRef(rawRef);
    const parsedCost = parseCostValue(rawCostVal);
    let invalidReason: string | null = null;

    if (!refNorm) {
      invalidReason = 'Referencia vacía';
    } else if (parsedCost === null) {
      invalidReason = rawCostStr ? 'Costo no numérico' : 'Costo vacío';
    } else if (parsedCost < 0) {
      invalidReason = 'Costo negativo';
    }

    rows.push({
      excelRow: i + 1,
      rawRef,
      refNorm,
      rawCost: rawCostVal,
      costoNuevo: invalidReason ? null : parsedCost,
      invalidReason,
    });
  }

  if (rows.length === 0) {
    return { rows: [], error: 'El archivo no contiene filas con datos.' };
  }

  return { rows, error: null };
}

export function buildCostUpdatePreview(
  rows: ParsedCostRow[],
  masterMap: Map<string, MasterCostRecord>
): CostUpdatePreview {
  const invalid: CostInvalidItem[] = [];
  const validRows: ParsedCostRow[] = [];

  for (const r of rows) {
    if (r.invalidReason || r.costoNuevo === null) {
      invalid.push({
        excelRow: r.excelRow,
        rawRef: r.rawRef,
        rawCost: String(r.rawCost ?? ''),
        reason: r.invalidReason ?? 'Valor inválido',
      });
    } else {
      validRows.push(r);
    }
  }

  const byRef = new Map<string, ParsedCostRow[]>();
  for (const r of validRows) {
    const list = byRef.get(r.refNorm) ?? [];
    list.push(r);
    byRef.set(r.refNorm, list);
  }

  const duplicates: CostDuplicateItem[] = [];
  const notFound: CostNotFoundItem[] = [];
  const toUpdate: CostUpdateItem[] = [];
  const unchanged: CostUpdateItem[] = [];

  for (const [refNorm, group] of byRef.entries()) {
    if (group.length > 1) {
      duplicates.push({
        refNorm,
        rows: group.map((g) => g.excelRow),
        values: group.map((g) => String(g.costoNuevo)),
      });
      continue;
    }

    const item = group[0]!;
    const costoNuevo = item.costoNuevo!;
    const master = masterMap.get(refNorm);

    if (!master) {
      notFound.push({
        excelRow: item.excelRow,
        referencia: item.rawRef,
        costoNuevo,
      });
      continue;
    }

    const costoTNuevo = master.cantTotal * costoNuevo;
    const varPct =
      master.costoActual !== null && master.costoActual > 0
        ? ((costoNuevo - master.costoActual) / master.costoActual) * 100
        : null;

    const changed =
      master.costoActual !== costoNuevo || master.costoTActual !== costoTNuevo;

    const entry: CostUpdateItem = {
      excelRow: item.excelRow,
      referencia: master.referencia,
      refNorm,
      costoActual: master.costoActual,
      costoNuevo,
      varPct,
      cantTotal: master.cantTotal,
      costoTActual: master.costoTActual,
      costoTNuevo,
      changed,
    };

    if (changed) {
      toUpdate.push(entry);
    } else {
      unchanged.push(entry);
    }
  }

  return {
    totalRows: rows.length,
    toUpdate,
    unchanged,
    notFound,
    duplicates,
    invalid,
  };
}

export function downloadCostUpdateTemplate(materialType: CostMaterialType) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Referencia', 'CostoU'],
    ['EJEMPLO-001', 12500],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Costos');
  XLSX.writeFile(wb, `plantilla_costos_${materialType}.xlsx`);
}

export function downloadCostUpdatePreview(
  preview: CostUpdatePreview,
  materialType: CostMaterialType
) {
  const wb = XLSX.utils.book_new();

  const updateRows = preview.toUpdate.map((r) => ({
    Referencia: r.referencia,
    'Costo actual': r.costoActual ?? 0,
    'Costo nuevo': r.costoNuevo,
    'Var %': r.varPct !== null ? Number(r.varPct.toFixed(1)) : '',
    'Cant. total': r.cantTotal,
    'Costo total anterior': r.costoTActual ?? 0,
    'Costo total nuevo': r.costoTNuevo,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(updateRows), 'A actualizar');

  if (preview.notFound.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        preview.notFound.map((r) => ({
          Fila: r.excelRow,
          Referencia: r.referencia,
          CostoU: r.costoNuevo,
        }))
      ),
      'No encontradas'
    );
  }

  if (preview.duplicates.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        preview.duplicates.map((d) => ({
          Referencia: d.refNorm,
          Filas: d.rows.join(', '),
          Valores: d.values.join(', '),
        }))
      ),
      'Duplicadas'
    );
  }

  if (preview.invalid.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        preview.invalid.map((r) => ({
          Fila: r.excelRow,
          Referencia: r.rawRef,
          CostoU: r.rawCost,
          Motivo: r.reason,
        }))
      ),
      'Invalidas'
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `previsualizacion_costos_${materialType}_${dateStr}.xlsx`);
}