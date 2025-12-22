import * as XLSX from 'xlsx';

export interface ParsedOperario {
  full_name: string;
  turno: number;
  rowNumber: number;
}

export interface OperariosParseResult {
  data: ParsedOperario[];
  errors: string[];
  warnings: string[];
}

/**
 * Normaliza el nombre de columna para hacerlo case-insensitive y sin acentos
 */
const normalizeColumnName = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/**
 * Busca la columna en el objeto de fila
 */
const findColumnValue = (row: Record<string, unknown>, possibleNames: string[]): string | number | undefined => {
  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeColumnName(key);
    if (possibleNames.some(name => normalizedKey === name || normalizedKey.includes(name))) {
      return row[key] as string | number | undefined;
    }
  }
  return undefined;
};

/**
 * Parsea un archivo Excel de operarios
 * Columnas esperadas: nombre (o full_name), turno
 */
export const parseOperariosExcel = async (file: File): Promise<OperariosParseResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: ParsedOperario[] = [];

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      errors.push('El archivo no contiene hojas de datos');
      return { data, errors, warnings };
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    if (jsonData.length === 0) {
      errors.push('El archivo no contiene datos');
      return { data, errors, warnings };
    }

    // Verificar columnas requeridas
    const firstRow = jsonData[0];
    const columns = Object.keys(firstRow);
    
    const hasNombre = columns.some(col => {
      const normalized = normalizeColumnName(col);
      return normalized === 'nombre' || normalized === 'full_name' || normalized === 'nombrecompleto';
    });
    
    const hasTurno = columns.some(col => {
      const normalized = normalizeColumnName(col);
      return normalized === 'turno';
    });

    if (!hasNombre) {
      errors.push('No se encontró la columna "nombre" o "full_name"');
    }
    if (!hasTurno) {
      errors.push('No se encontró la columna "turno"');
    }

    if (errors.length > 0) {
      return { data, errors, warnings };
    }

    // Procesar filas
    const seenNames = new Set<string>();

    jsonData.forEach((row, index) => {
      const rowNumber = index + 2; // +2 porque índice 0 + fila de encabezado
      
      const nombreValue = findColumnValue(row, ['nombre', 'full_name', 'nombrecompleto']);
      const turnoValue = findColumnValue(row, ['turno']);

      // Validar nombre
      const nombre = nombreValue?.toString().trim();
      if (!nombre) {
        errors.push(`Fila ${rowNumber}: El nombre está vacío`);
        return;
      }

      // Validar turno
      let turno = 1;
      if (turnoValue !== undefined && turnoValue !== null && turnoValue !== '') {
        const turnoNum = parseInt(turnoValue.toString());
        if (isNaN(turnoNum) || (turnoNum !== 1 && turnoNum !== 2)) {
          warnings.push(`Fila ${rowNumber}: Turno inválido "${turnoValue}", usando turno 1`);
          turno = 1;
        } else {
          turno = turnoNum;
        }
      }

      // Detectar duplicados dentro del archivo
      const nombreLower = nombre.toLowerCase();
      if (seenNames.has(nombreLower)) {
        warnings.push(`Fila ${rowNumber}: "${nombre}" está duplicado en el archivo`);
      } else {
        seenNames.add(nombreLower);
      }

      data.push({
        full_name: nombre,
        turno,
        rowNumber,
      });
    });

    return { data, errors, warnings };
  } catch (error) {
    console.error('Error parsing Excel:', error);
    errors.push('Error al leer el archivo. Asegúrate de que sea un archivo Excel válido (.xlsx, .xls)');
    return { data, errors, warnings };
  }
};

/**
 * Genera un archivo Excel de plantilla para importar operarios
 */
export const generateOperariosTemplate = (): void => {
  const templateData = [
    { nombre: 'Juan Pérez', turno: 1 },
    { nombre: 'María García', turno: 2 },
    { nombre: 'Carlos López', turno: 1 },
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Operarios');
  
  XLSX.writeFile(workbook, 'plantilla_operarios.xlsx');
};
