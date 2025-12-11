import * as XLSX from 'xlsx';

export type MaterialType = 'MP' | 'PP';

export interface ParsedRow {
  referencia: string;
  material_type: MaterialType;
  // Columnas compartidas
  control: string | null;
  cant_pld: number | null;
  cant_plr: number | null;
  cant_za: number | null;
  costo_t: number | null;
  // Columnas solo MP
  costo_u_mp: number | null;
  cant_alm_mp: number | null;
  cant_prov_d: number | null;
  cant_prov_r: number | null;
  cant_t_mp: number | null;
  // Columnas solo PP
  mp_costo: number | null;
  mo_costo: number | null;
  servicio: number | null;
  costo_u_pp: number | null;
  cant_alm_pp: number | null;
  cant_prov_pp: number | null;
  cant_total_pp: number | null;
  // Columna calculada (para preview, no se inserta)
  cant_total_erp?: number;
}

export interface ParseResult {
  data: ParsedRow[];
  errors: string[];
  warnings: string[];
}

// Column mappings for MP file
const MP_COLUMN_MAP: Record<string, keyof ParsedRow> = {
  'referencia': 'referencia',
  'control': 'control',
  'costo.u': 'costo_u_mp',
  'costou': 'costo_u_mp',
  'cant.alm': 'cant_alm_mp',
  'cant.pld': 'cant_pld',
  'cant.plr': 'cant_plr',
  'cant.za': 'cant_za',
  'cant.provd': 'cant_prov_d',
  'cant.provr': 'cant_prov_r',
  'cant.t': 'cant_t_mp',
  'costo.t': 'costo_t',
};

// Column mappings for PP file
const PP_COLUMN_MAP: Record<string, keyof ParsedRow> = {
  'referencia': 'referencia',
  'control': 'control',
  'mp': 'mp_costo',
  'mo': 'mo_costo',
  'servicio': 'servicio',
  'costo.u': 'costo_u_pp',
  'costou': 'costo_u_pp',
  'can.alm': 'cant_alm_pp',
  'cant.alm': 'cant_alm_pp',
  'cant.pld': 'cant_pld',
  'cant.plr': 'cant_plr',
  'cant.za': 'cant_za',
  'cant.prov': 'cant_prov_pp',
  'cant.total': 'cant_total_pp',
  'costo.t': 'costo_t',
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

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
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
  return isNaN(num) ? null : num;
}

function parseString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return String(value).trim();
}

// Create empty row with all nulls for the given type
function createEmptyRow(type: MaterialType): ParsedRow {
  return {
    referencia: '',
    material_type: type,
    // Compartidas
    control: null,
    cant_pld: null,
    cant_plr: null,
    cant_za: null,
    costo_t: null,
    // Solo MP (null para PP)
    costo_u_mp: null,
    cant_alm_mp: null,
    cant_prov_d: null,
    cant_prov_r: null,
    cant_t_mp: null,
    // Solo PP (null para MP)
    mp_costo: null,
    mo_costo: null,
    servicio: null,
    costo_u_pp: null,
    cant_alm_pp: null,
    cant_prov_pp: null,
    cant_total_pp: null,
  };
}

// Calculate total ERP for preview
function calculateTotalErp(row: ParsedRow): number {
  if (row.material_type === 'MP') {
    return (row.cant_alm_mp ?? 0) + (row.cant_pld ?? 0) + (row.cant_plr ?? 0) + (row.cant_za ?? 0);
  } else {
    return (row.cant_alm_pp ?? 0) + (row.cant_pld ?? 0) + (row.cant_plr ?? 0) + (row.cant_za ?? 0);
  }
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
        
        // Create mapping from normalized to original
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
        let convertedToNullCount = 0;

        jsonData.forEach((row: Record<string, unknown>) => {
          // Find the reference column (case-insensitive)
          let referencia = '';
          for (const [normalized, original] of Object.entries(columnMapping)) {
            if (normalized === 'referencia') {
              referencia = String(row[original] || '').trim();
              break;
            }
          }

          if (!referencia) {
            emptyReferenceCount++;
            return; // Skip rows without reference
          }

          const parsedRow = createEmptyRow(type);
          parsedRow.referencia = referencia;

          // Map each column
          for (const [normalized, original] of Object.entries(columnMapping)) {
            const dbField = columnMap[normalized];
            if (dbField && dbField !== 'referencia') {
              const rawValue = row[original];
              
              // Control is a string, others are numbers
              if (dbField === 'control') {
                parsedRow.control = parseString(rawValue);
              } else {
                const numValue = parseNumber(rawValue);
                if (rawValue !== '' && rawValue !== null && numValue === null) {
                  convertedToNullCount++;
                }
                // Assign dynamically based on field name
                switch (dbField) {
                  case 'cant_pld': parsedRow.cant_pld = numValue; break;
                  case 'cant_plr': parsedRow.cant_plr = numValue; break;
                  case 'cant_za': parsedRow.cant_za = numValue; break;
                  case 'costo_t': parsedRow.costo_t = numValue; break;
                  case 'costo_u_mp': parsedRow.costo_u_mp = numValue; break;
                  case 'cant_alm_mp': parsedRow.cant_alm_mp = numValue; break;
                  case 'cant_prov_d': parsedRow.cant_prov_d = numValue; break;
                  case 'cant_prov_r': parsedRow.cant_prov_r = numValue; break;
                  case 'cant_t_mp': parsedRow.cant_t_mp = numValue; break;
                  case 'mp_costo': parsedRow.mp_costo = numValue; break;
                  case 'mo_costo': parsedRow.mo_costo = numValue; break;
                  case 'servicio': parsedRow.servicio = numValue; break;
                  case 'costo_u_pp': parsedRow.costo_u_pp = numValue; break;
                  case 'cant_alm_pp': parsedRow.cant_alm_pp = numValue; break;
                  case 'cant_prov_pp': parsedRow.cant_prov_pp = numValue; break;
                  case 'cant_total_pp': parsedRow.cant_total_pp = numValue; break;
                }
              }
            }
          }

          // Calculate total for preview
          parsedRow.cant_total_erp = calculateTotalErp(parsedRow);

          result.data.push(parsedRow);
        });

        if (emptyReferenceCount > 0) {
          result.warnings.push(`${emptyReferenceCount} filas omitidas por referencia vacía`);
        }

        if (convertedToNullCount > 0) {
          result.warnings.push(`${convertedToNullCount} valores no numéricos ignorados`);
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
  const mpRefs = mpData.map((r) => r.referencia);
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
  const ppRefs = ppData.map((r) => r.referencia);
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
