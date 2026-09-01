import * as XLSX from 'xlsx';
import { parsePtNumber } from '@/lib/ptMasterParser';

export interface ParsedPtLocation {
  referencia: string;
  piso: string;
  prodc: string | null;
  ubic: string | null;
  linea: string | null;
  ue: number | null;
  orden: number | null;
  rowNumber: number;
}

export interface PtLocationsParseResult {
  data: ParsedPtLocation[];
  errors: string[];
  warnings: string[];
}

const normalize = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\s_-]/g, '')
    .trim();

const ALIASES: Record<keyof Omit<ParsedPtLocation, 'rowNumber'>, string[]> = {
  referencia: ['referencia', 'codigo', 'ref'],
  piso: ['piso', 'nivel'],
  prodc: ['prodc', 'producto', 'prod'],
  ubic: ['ubic', 'ubicacion'],
  linea: ['linea'],
  ue: ['ue', 'unidadempaque'],
  orden: ['#', 'no', 'num', 'orden', 'item'],
};

const findKey = (columns: string[], aliases: string[]): string | undefined =>
  columns.find((col) => aliases.includes(normalize(col)));

/**
 * Parsea la plantilla de ubicaciones de Producto Terminado.
 * Columnas: #, PISO, PRODC, UBIC, LINEA, REFERENCIA, U.E
 * Obligatorias: PISO y REFERENCIA
 */
export const parsePtLocationsExcel = async (file: File): Promise<PtLocationsParseResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: ParsedPtLocation[] = [];

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      errors.push('El archivo no contiene hojas de datos');
      return { data, errors, warnings };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: '',
    });

    if (rows.length === 0) {
      errors.push('El archivo no contiene datos');
      return { data, errors, warnings };
    }

    const columns = Object.keys(rows[0]);
    const keys = {
      referencia: findKey(columns, ALIASES.referencia),
      piso: findKey(columns, ALIASES.piso),
      prodc: findKey(columns, ALIASES.prodc),
      ubic: findKey(columns, ALIASES.ubic),
      linea: findKey(columns, ALIASES.linea),
      ue: findKey(columns, ALIASES.ue),
      orden: findKey(columns, ALIASES.orden),
    };

    if (!keys.referencia) errors.push('No se encontró la columna "REFERENCIA"');
    if (!keys.piso) errors.push('No se encontró la columna "PISO"');
    if (errors.length > 0) return { data, errors, warnings };

    const text = (row: Record<string, unknown>, key?: string): string | null => {
      if (!key) return null;
      const v = String(row[key] ?? '').trim();
      return v === '' ? null : v;
    };

    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const referencia = text(row, keys.referencia);
      const piso = text(row, keys.piso);

      if (!referencia && !piso) return; // fila vacía

      if (!referencia) {
        errors.push(`Fila ${rowNumber}: la referencia está vacía`);
        return;
      }
      if (!piso) {
        errors.push(`Fila ${rowNumber}: el piso está vacío`);
        return;
      }

      const ubic = text(row, keys.ubic);
      const comboKey = `${referencia.toLowerCase()}|${piso.toLowerCase()}|${(ubic || '').toLowerCase()}`;
      if (seen.has(comboKey)) {
        warnings.push(`Fila ${rowNumber}: combinación duplicada (${referencia} · piso ${piso}${ubic ? ` · ${ubic}` : ''})`);
      } else {
        seen.add(comboKey);
      }

      const ordenRaw = text(row, keys.orden);
      const ordenNum = ordenRaw !== null ? parsePtNumber(ordenRaw) : null;

      data.push({
        referencia,
        piso,
        prodc: text(row, keys.prodc),
        ubic,
        linea: text(row, keys.linea),
        ue: keys.ue ? parsePtNumber(row[keys.ue]) : null,
        orden: ordenNum !== null ? Math.round(ordenNum) : null,
        rowNumber,
      });
    });

    if (data.length === 0 && errors.length === 0) {
      errors.push('No se encontró ninguna ubicación válida en el archivo');
    }

    return { data, errors, warnings };
  } catch (error) {
    console.error('[PT-LOCATIONS-PARSER]', error);
    errors.push('Error al leer el archivo. Verifica que sea un Excel válido (.xlsx, .xls)');
    return { data, errors, warnings };
  }
};

/** Descarga la plantilla de ubicaciones PT */
export const generatePtLocationsTemplate = (): void => {
  const templateData = [
    { '#': 1, PISO: '1', PRODC: 'B', UBIC: '1BA-1BB-2BG-2BF', LINEA: 'PL', REFERENCIA: 'CP2X4-CC', 'U.E': 432 },
    { '#': 2, PISO: '2', PRODC: '', UBIC: '', LINEA: '', REFERENCIA: 'ADAPTER12', 'U.E': '' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 10 },
    { wch: 24 },
    { wch: 10 },
    { wch: 20 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ubicaciones PT');
  XLSX.writeFile(workbook, 'plantilla_ubicaciones_pt.xlsx');
};
