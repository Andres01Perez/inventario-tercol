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

    // Lee la hoja como matriz cruda para detectar la fila de encabezados.
    // El ERP suele exportar con membrete, por lo que CODIGO/CANT pueden estar
    // varias filas más abajo de la primera.
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    });

    const HEADER_SCAN_LIMIT = 20;
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rawRows.length, HEADER_SCAN_LIMIT); i++) {
      const cells = (rawRows[i] as unknown[]).map((c) => normalize(String(c ?? '')));
      if (cells.some((c) => CODIGO_ALIASES.includes(c)) && cells.some((c) => CANTIDAD_ALIASES.includes(c))) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      errors.push('No se encontraron las columnas "CODIGO" y "CANT." en las primeras filas del archivo');
      return { data, errors, warnings };
    }

    const headers = (rawRows[headerIndex] as unknown[]).map((c) => String(c ?? '').trim());
    const codigoIdx = headers.findIndex((h) => CODIGO_ALIASES.includes(normalize(h)));
    const descIdx = headers.findIndex((h) => DESCRIPCION_ALIASES.includes(normalize(h)));
    const cantIdx = headers.findIndex((h) => CANTIDAD_ALIASES.includes(normalize(h)));

    if (codigoIdx === -1) errors.push('No se encontró la columna "CODIGO"');
    if (cantIdx === -1) errors.push('No se encontró la columna "CANT."');
    if (errors.length > 0) return { data, errors, warnings };
    if (descIdx === -1) warnings.push('No se encontró la columna "DESCRIPCION"; se importará vacía');

    // Convierte las filas posteriores al encabezado en objetos
    const rows: Record<string, unknown>[] = [];
    for (let r = headerIndex + 1; r < rawRows.length; r++) {
      const cells = rawRows[r] as unknown[];
      const row: Record<string, unknown> = {};
      headers.forEach((h, c) => {
        if (h) row[h] = cells[c];
      });
      rows.push(row);
    }

    if (rows.length === 0) {
      errors.push('El archivo no contiene datos debajo del encabezado');
      return { data, errors, warnings };
    }

    const codigoKey = headers[codigoIdx];
    const descKey = descIdx >= 0 ? headers[descIdx] : undefined;
    const cantKey = headers[cantIdx];

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
