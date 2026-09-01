import * as XLSX from 'xlsx';

export type Bodega = 'almacen' | 'planta';

export interface ParsedLocation {
  master_reference: string;
  bodega: Bodega;
  subcategoria: string | null;
  observaciones: string | null;
  location_name: string | null;
  location_detail: string | null;
  punto_referencia: string | null;
  metodo_conteo: string | null;
  activo: boolean;
  terminado: boolean;
  rowNumber: number;
}

export interface LocationsParseResult {
  data: ParsedLocation[];
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
 * Busca la columna en el objeto de fila con múltiples nombres posibles
 */
const findColumnValue = (row: Record<string, unknown>, possibleNames: string[]): string | undefined => {
  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeColumnName(key);
    if (possibleNames.some(name => normalizedKey === name || normalizedKey.includes(name))) {
      const value = row[key];
      return value !== undefined && value !== null ? String(value).trim() : undefined;
    }
  }
  return undefined;
};

/**
 * Interpreta un valor SI/NO. Devuelve null si no se reconoce.
 */
const parseBooleanFlag = (raw: string | undefined): boolean | null => {
  if (raw === undefined || raw === '') return null;
  const v = normalizeColumnName(raw);
  if (['si', 'sí', 's', 'true', '1', 'x', 'verdadero'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'falso'].includes(v)) return false;
  return null;
};


/**
 * Parsea un archivo Excel de ubicaciones
 * Columnas esperadas: Referencia, Subcategoría, Observaciones, Ubicación, Ubicación Detallada, Punto Referencia, Método Conteo
 */
export const parseLocationsExcel = async (file: File): Promise<LocationsParseResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: ParsedLocation[] = [];

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

    // Verificar columna requerida: Referencia
    const firstRow = jsonData[0];
    const columns = Object.keys(firstRow);
    
    const hasReferencia = columns.some(col => {
      const normalized = normalizeColumnName(col);
      return normalized === 'referencia' || normalized === 'ref' || normalized === 'master_reference';
    });

    if (!hasReferencia) {
      errors.push('No se encontró la columna "Referencia"');
      return { data, errors, warnings };
    }

    // Detectar duplicados dentro del archivo (misma referencia + ubicación)
    const seenCombos = new Set<string>();

    jsonData.forEach((row, index) => {
      const rowNumber = index + 2; // +2 porque índice 0 + fila de encabezado

      // Obtener valores de las columnas
      const referencia = findColumnValue(row, ['referencia', 'ref', 'master_reference']);
      const bodegaRaw = findColumnValue(row, ['bodega']);
      const subcategoria = findColumnValue(row, ['subcategoria', 'subcategoría', 'sub_categoria']);
      const observaciones = findColumnValue(row, ['observaciones', 'observacion', 'obs', 'notas']);
      const ubicacion = findColumnValue(row, ['ubicacion', 'ubicación', 'location', 'location_name']);
      const ubicacionDetallada = findColumnValue(row, ['ubicacion detallada', 'ubicación detallada', 'location_detail', 'detalle']);
      const puntoReferencia = findColumnValue(row, ['punto referencia', 'punto_referencia', 'punto ref', 'referencia punto']);
      const metodoConteo = findColumnValue(row, ['metodo conteo', 'método conteo', 'metodo_conteo', 'metodo']);
      const activoRaw = findColumnValue(row, ['activo']);
      const terminadoRaw = findColumnValue(row, ['terminado']);

      // Validar referencia (campo obligatorio)
      if (!referencia) {
        errors.push(`Fila ${rowNumber}: La referencia está vacía`);
        return;
      }

      // Validar bodega (campo obligatorio: Almacén o Planta)
      const bodegaNormalized = bodegaRaw ? normalizeColumnName(bodegaRaw) : '';
      let bodega: Bodega | null = null;
      if (bodegaNormalized === 'almacen') bodega = 'almacen';
      else if (bodegaNormalized === 'planta') bodega = 'planta';
      if (!bodega) {
        errors.push(`Fila ${rowNumber}: Bodega vacía o inválida (use "Almacén" o "Planta")`);
        return;
      }


      // Detectar duplicados dentro del archivo (referencia + ubicación detallada + punto referencia)
      const comboKey = `${referencia.toLowerCase()}|${(ubicacionDetallada || '').toLowerCase()}|${(puntoReferencia || '').toLowerCase()}`;
      if (seenCombos.has(comboKey)) {
        warnings.push(`Fila ${rowNumber}: Combinación duplicada (${referencia} + ${ubicacionDetallada || 'sin detalle'} + ${puntoReferencia || 'sin punto ref'})`);
      } else {
        seenCombos.add(comboKey);
      }

      // Activo / Terminado (opcionales)
      const activoParsed = parseBooleanFlag(activoRaw);
      if (activoRaw && activoParsed === null) {
        warnings.push(`Fila ${rowNumber}: Valor de "Activo" no reconocido (${activoRaw}); se usa SI`);
      }
      const terminadoParsed = parseBooleanFlag(terminadoRaw);
      if (terminadoRaw && terminadoParsed === null) {
        warnings.push(`Fila ${rowNumber}: Valor de "Terminado" no reconocido (${terminadoRaw}); se usa NO`);
      }

      data.push({
        master_reference: referencia,
        bodega,
        subcategoria: subcategoria || null,
        observaciones: observaciones || null,
        location_name: ubicacion || null,
        location_detail: ubicacionDetallada || null,
        punto_referencia: puntoReferencia || null,
        metodo_conteo: metodoConteo || null,
        activo: activoParsed === null ? true : activoParsed,
        terminado: terminadoParsed === null ? false : terminadoParsed,
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
 * Genera un archivo Excel de plantilla para importar ubicaciones
 */
export const generateLocationsTemplate = (): void => {
  const templateData = [
    {
      Referencia: 'REF-001',
      Bodega: 'Almacén',
      Subcategoría: 'Tornillos',
      Observaciones: 'Zona A',
      Ubicación: 'ESTANTE-1',
      'Ubicación Detallada': 'Nivel 3',
      'Punto Referencia': 'Puerta principal',
      'Método Conteo': 'Manual',
      Activo: 'SI',
      Terminado: 'NO'
    },
    {
      Referencia: 'REF-001',
      Bodega: 'Planta',
      Subcategoría: 'Tornillos',
      Observaciones: 'Zona B',
      Ubicación: 'ESTANTE-2',
      'Ubicación Detallada': 'Nivel 1',
      'Punto Referencia': 'Pasillo 2',
      'Método Conteo': 'Conteo rápido',
      Activo: 'SI',
      Terminado: 'SI'
    },
    {
      Referencia: 'REF-002',
      Bodega: 'Almacén',
      Subcategoría: 'Tuercas',
      Observaciones: '',
      Ubicación: 'BODEGA-3',
      'Ubicación Detallada': '',
      'Punto Referencia': '',
      'Método Conteo': 'Báscula',
      Activo: 'NO',
      Terminado: 'NO'
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);

  // Ajustar ancho de columnas
  worksheet['!cols'] = [
    { wch: 15 }, // Referencia
    { wch: 12 }, // Bodega
    { wch: 15 }, // Subcategoría
    { wch: 20 }, // Observaciones
    { wch: 15 }, // Ubicación
    { wch: 20 }, // Ubicación Detallada
    { wch: 18 }, // Punto Referencia
    { wch: 15 }, // Método Conteo
    { wch: 8 },  // Activo
    { wch: 10 }, // Terminado
  ];
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ubicaciones');
  
  XLSX.writeFile(workbook, 'plantilla_ubicaciones.xlsx');
};
