import * as XLSX from 'xlsx';

export interface ParsedPtMaster {
  referencia: string;
  descripcion: string | null;
  cant_erp: number;
  rowNumber: number;
}

export interface PtMasterParseResult {
  data: ParsedPtMaster[];
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

const CODIGO_ALIASES = ['codigo', 'referencia', 'ref', 'item'];
const DESCRIPCION_ALIASES = ['descripcion', 'desc', 'nombre', 'detalle'];
const CANTIDAD_ALIASES = ['cant', 'cantidad', 'saldo', 'existencia', 'canttotal', 'total'];

const findKey = (columns: string[], aliases: string[]): string | undefined =>
  columns.find((col) => aliases.includes(normalize(col)));

/** Convierte texto numérico en formato es-CO o en-US a número */
export const parsePtNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;

  let str = String(value).trim().replace(/\s/g, '');
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    str = lastComma > lastDot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (lastComma > -1) {
    str = str.substring(lastComma + 1).length <= 2 ? str.replace(',', '.') : str.replace(/,/g, '');
  }

  const num = parseFloat(str);
  return isNaN(num) ? null : num;
};

/**
 * Parsea la maestra de Producto Terminado.
 * Columnas esperadas: CODIGO, DESCRIPCION, CANT.
 */
export const parsePtMasterExcel = async (file: File): Promise<PtMasterParseResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: ParsedPtMaster[] = [];

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
    const codigoKey = findKey(columns, CODIGO_ALIASES);
    const descKey = findKey(columns, DESCRIPCION_ALIASES);
    const cantKey = findKey(columns, CANTIDAD_ALIASES);

    if (!codigoKey) {
      errors.push('No se encontró la columna "CODIGO"');
    }
    if (!cantKey) {
      errors.push('No se encontró la columna "CANT."');
    }
    if (errors.length > 0) return { data, errors, warnings };
    if (!descKey) warnings.push('No se encontró la columna "DESCRIPCION"; se importará vacía');

    const seen = new Map<string, number>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const referencia = String(row[codigoKey!] ?? '').trim();
      if (!referencia) return; // fila vacía: se omite en silencio

      const cantRaw = row[cantKey!];
      const cant = parsePtNumber(cantRaw);
      if (cant === null) {
        warnings.push(`Fila ${rowNumber}: cantidad no numérica (${String(cantRaw)}); se usa 0`);
      }

      if (seen.has(referencia)) {
        errors.push(
          `Fila ${rowNumber}: la referencia ${referencia} está duplicada (también en la fila ${seen.get(referencia)})`
        );
        return;
      }
      seen.set(referencia, rowNumber);

      data.push({
        referencia,
        descripcion: descKey ? String(row[descKey] ?? '').trim() || null : null,
        cant_erp: cant ?? 0,
        rowNumber,
      });
    });

    if (data.length === 0 && errors.length === 0) {
      errors.push('No se encontró ninguna referencia válida en el archivo');
    }

    return { data, errors, warnings };
  } catch (error) {
    console.error('[PT-MASTER-PARSER]', error);
    errors.push('Error al leer el archivo. Verifica que sea un Excel válido (.xlsx, .xls)');
    return { data, errors, warnings };
  }
};
