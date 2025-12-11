import * as XLSX from 'xlsx';

export type MaterialType = 'MP' | 'PP';

export interface ParsedRow {
  reference: string;
  material_type: MaterialType;
  erp_alm: number;
  erp_pld: number;
  erp_plr: number;
  erp_za: number;
  erp_target_qty: number;
}

export interface ParseResult {
  data: ParsedRow[];
  errors: string[];
  warnings: string[];
}

// Column mappings for each file type
const MP_COLUMN_MAP: Record<string, keyof Omit<ParsedRow, 'material_type'>> = {
  'referencia': 'reference',
  'cant.alm': 'erp_alm',
  'cant.pld': 'erp_pld',
  'cant.plr': 'erp_plr',
  'cant.za': 'erp_za',
  'cant.t': 'erp_target_qty',
};

const PP_COLUMN_MAP: Record<string, keyof Omit<ParsedRow, 'material_type'>> = {
  'referencia': 'reference',
  'can.alm': 'erp_alm',      // Note: "Can" without "t"
  'cant.alm': 'erp_alm',     // Also accept with "t"
  'cant.pld': 'erp_pld',
  'cant.plr': 'erp_plr',
  'cant.za': 'erp_za',
  'cant.total': 'erp_target_qty',
};

const REQUIRED_COLUMNS_MP = ['referencia'];
const REQUIRED_COLUMNS_PP = ['referencia'];

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove accents
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  
  // If already a number, return directly
  if (typeof value === 'number') {
    return value;
  }
  
  let str = String(value).trim();
  
  // Detect regional format: Spanish (1.234,56) vs American (1,234.56)
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  
  if (lastComma > -1 && lastDot > -1) {
    // Both present - determine which is decimal
    if (lastComma > lastDot) {
      // Spanish format: 1.234,56 → comma is decimal
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // American format: 1,234.56 → dot is decimal
      str = str.replace(/,/g, '');
    }
  } else if (lastComma > -1 && lastDot === -1) {
    // Only commas: could be decimal (1,5) or thousands (1,234)
    const afterComma = str.substring(lastComma + 1);
    if (afterComma.length <= 2) {
      // It's decimal: 1,5 → 1.5
      str = str.replace(',', '.');
    } else {
      // It's thousands separator: 1,234 → 1234
      str = str.replace(/,/g, '');
    }
  }
  // If only dot(s), parseFloat handles it correctly
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function parseExcelFile(file: File, type: MaterialType): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (jsonData.length === 0) {
          resolve({
            data: [],
            errors: ['El archivo está vacío o no tiene datos válidos'],
            warnings: [],
          });
          return;
        }

        // Get original columns
        const firstRow = jsonData[0] as Record<string, unknown>;
        const originalColumns = Object.keys(firstRow);
        const normalizedColumns = originalColumns.map(normalizeColumnName);
        
        // Create mapping from original to normalized
        const columnMapping: Record<string, string> = {};
        originalColumns.forEach((col, idx) => {
          columnMapping[normalizedColumns[idx]] = col;
        });

        // Validate required columns
        const columnMap = type === 'MP' ? MP_COLUMN_MAP : PP_COLUMN_MAP;
        const requiredColumns = type === 'MP' ? REQUIRED_COLUMNS_MP : REQUIRED_COLUMNS_PP;
        
        const missingColumns = requiredColumns.filter(
          (col) => !normalizedColumns.includes(col)
        );

        if (missingColumns.length > 0) {
          resolve({
            data: [],
            errors: [`Columnas requeridas no encontradas: ${missingColumns.join(', ')}`],
            warnings: [],
          });
          return;
        }

        // Transform data
        const result: ParseResult = {
          data: [],
          errors: [],
          warnings: [],
        };

        let emptyReferenceCount = 0;
        let convertedToZeroCount = 0;

        jsonData.forEach((row: Record<string, unknown>, index: number) => {
          // Find the reference column (case-insensitive)
          let reference = '';
          for (const [normalized, original] of Object.entries(columnMapping)) {
            if (normalized === 'referencia') {
              reference = String(row[original] || '').trim();
              break;
            }
          }

          if (!reference) {
            emptyReferenceCount++;
            return; // Skip rows without reference
          }

          const parsedRow: ParsedRow = {
            reference,
            material_type: type,
            erp_alm: 0,
            erp_pld: 0,
            erp_plr: 0,
            erp_za: 0,
            erp_target_qty: 0,
          };

          // Map each column
          for (const [normalized, original] of Object.entries(columnMapping)) {
            const dbField = columnMap[normalized];
            if (dbField && dbField !== 'reference') {
              const value = parseNumber(row[original]);
              if (row[original] !== '' && row[original] !== null && value === 0) {
                convertedToZeroCount++;
              }
              if (dbField === 'erp_alm') parsedRow.erp_alm = value;
              else if (dbField === 'erp_pld') parsedRow.erp_pld = value;
              else if (dbField === 'erp_plr') parsedRow.erp_plr = value;
              else if (dbField === 'erp_za') parsedRow.erp_za = value;
              else if (dbField === 'erp_target_qty') parsedRow.erp_target_qty = value;
            }
          }

          result.data.push(parsedRow);
        });

        if (emptyReferenceCount > 0) {
          result.warnings.push(`${emptyReferenceCount} filas omitidas por referencia vacía`);
        }

        if (convertedToZeroCount > 0) {
          result.warnings.push(`${convertedToZeroCount} valores no numéricos convertidos a 0`);
        }

        resolve(result);
      } catch (error) {
        resolve({
          data: [],
          errors: [`Error al procesar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`],
          warnings: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        data: [],
        errors: ['Error al leer el archivo'],
        warnings: [],
      });
    };

    reader.readAsBinaryString(file);
  });
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  duplicatesWithinMp: string[];
  duplicatesWithinPp: string[];
  duplicatesBetweenTypes: string[];
}

export function validateCombinedData(
  mpData: ParsedRow[],
  ppData: ParsedRow[]
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    duplicatesWithinMp: [],
    duplicatesWithinPp: [],
    duplicatesBetweenTypes: [],
  };

  // Check duplicates within MP
  const mpRefs = mpData.map((r) => r.reference);
  const mpDuplicates = mpRefs.filter((ref, idx) => mpRefs.indexOf(ref) !== idx);
  if (mpDuplicates.length > 0) {
    result.duplicatesWithinMp = [...new Set(mpDuplicates)];
    result.errors.push(
      `Referencias duplicadas en MP: ${result.duplicatesWithinMp.slice(0, 5).join(', ')}${
        result.duplicatesWithinMp.length > 5 ? ` y ${result.duplicatesWithinMp.length - 5} más` : ''
      }`
    );
    result.isValid = false;
  }

  // Check duplicates within PP
  const ppRefs = ppData.map((r) => r.reference);
  const ppDuplicates = ppRefs.filter((ref, idx) => ppRefs.indexOf(ref) !== idx);
  if (ppDuplicates.length > 0) {
    result.duplicatesWithinPp = [...new Set(ppDuplicates)];
    result.errors.push(
      `Referencias duplicadas en PP: ${result.duplicatesWithinPp.slice(0, 5).join(', ')}${
        result.duplicatesWithinPp.length > 5 ? ` y ${result.duplicatesWithinPp.length - 5} más` : ''
      }`
    );
    result.isValid = false;
  }

  // Check duplicates between MP and PP
  const crossDuplicates = mpRefs.filter((ref) => ppRefs.includes(ref));
  if (crossDuplicates.length > 0) {
    result.duplicatesBetweenTypes = [...new Set(crossDuplicates)];
    result.errors.push(
      `Referencias duplicadas entre MP y PP: ${result.duplicatesBetweenTypes.slice(0, 5).join(', ')}${
        result.duplicatesBetweenTypes.length > 5 ? ` y ${result.duplicatesBetweenTypes.length - 5} más` : ''
      }`
    );
    result.isValid = false;
  }

  return result;
}
