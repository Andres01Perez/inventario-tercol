import * as XLSX from 'xlsx';

export const MAX_AJUSTES = 5000;
export const normalizeAjuste = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export interface AjusteInput {
  fila: number; referencia: string; bodega: string; familia: string;
  cantidad_final: number | null; motivo: string; soporte: string; observacion: string;
}
export interface AjustePreview extends AjusteInput {
  estado_actual: string | null; cantidad_anterior: number; diferencia: number;
  costo_u: number; impacto_valor: number; num_ubicaciones: number;
  creara_ubicacion: boolean; errores: string[]; advertencias: string[];
  revision: string; snapshot: Record<string, unknown>;
}
export function parseAjusteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim();
  // One decimal separator only: mixed separators are ambiguous, never silently change quantities.
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)) return null;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}
export function parseAjustesExcel(buffer: ArrayBuffer): AjusteInput[] {
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error('El archivo supera 10 MB');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const first = workbook.SheetNames[0];
  const sheet = first ? workbook.Sheets[first] : undefined;
  if (!sheet?.['!ref']) throw new Error('La primera hoja está vacía');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r - range.s.r > MAX_AJUSTES) throw new Error(`Máximo ${MAX_AJUSTES} filas por archivo`);
  const headers = ['referencia', 'bodega', 'familia', 'cantidad_final', 'motivo', 'soporte', 'observacion'];
  const indices = headers.map(name => {
    const matches: number[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
      if (normalizeAjuste(cell?.w ?? cell?.v).replace(/\s+/g, '_') === name) matches.push(c);
    }
    if (matches.length !== 1) throw new Error(`Encabezado ${name}: debe existir exactamente una vez`);
    return matches[0];
  });
  const rows: AjusteInput[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cells = indices.map(c => sheet[XLSX.utils.encode_cell({ r, c })]);
    if (cells.every(cell => cell?.v == null || String(cell.v).trim() === '')) continue;
    const text = (index: number) => String(cells[index]?.w ?? cells[index]?.v ?? '').trim();
    rows.push({ fila: r + 1, referencia: text(0).toUpperCase(), bodega: normalizeAjuste(text(1)),
      familia: text(2).toUpperCase(), cantidad_final: parseAjusteNumber(cells[3]?.v),
      motivo: text(4), soporte: text(5), observacion: text(6) });
  }
  if (!rows.length) throw new Error('No hay filas de ajustes');
  return rows;
}
export function validateAjuste(row: AjusteInput, master?: { familia: string; control: string | null }, duplicates = false): string[] {
  const errors: string[] = [];
  if (!master) errors.push('Referencia inexistente');
  else {
    if (row.familia !== master.familia) errors.push('Familia distinta a la maestra');
    if (master.familia === 'PP' && row.bodega !== (master.control === null ? 'planta' : 'almacen')) errors.push('PP en bodega contraria al Control');
  }
  if (!['MP', 'PP'].includes(row.familia)) errors.push('Familia inválida');
  if (!['almacen', 'planta'].includes(row.bodega)) errors.push('Bodega inválida');
  if (row.cantidad_final === null || !Number.isFinite(row.cantidad_final) || row.cantidad_final < 0) errors.push('Cantidad vacía, inválida o negativa');
  if (!row.motivo.trim()) errors.push('Motivo obligatorio');
  if (!row.soporte.trim()) errors.push('Soporte obligatorio');
  if (duplicates) errors.push('Duplicada: referencia + bodega');
  return errors;
}
export function repartirAjuste(quantity: number, weights: number[]): number[] {
  if (!weights.length) throw new Error('Sin ubicaciones');
  const total = weights.reduce((s, v) => s + Math.max(v, 0), 0);
  let acc = 0;
  return weights.map((value, index) => {
    const q = index === weights.length - 1 ? quantity - acc : Math.floor(quantity * (total > 0 ? Math.max(value, 0) / total : 1 / weights.length) * 1e6) / 1e6;
    acc += q;
    return q;
  });
}
export function downloadAjustesTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['Referencia', 'Bodega', 'Familia', 'Cantidad_final', 'Motivo', 'Soporte', 'Observacion']]);
  sheet['!cols'] = [20, 15, 10, 18, 35, 60, 50].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ajustes');
  XLSX.writeFile(workbook, 'Plantilla_Ajustes_Cierre.xlsx');
}
export function exportAjustesBackup(rows: AjustePreview[], inventory: string) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(r => ({ referencia: r.referencia, bodega: r.bodega, familia: r.familia, estado: r.estado_actual, ronda_anterior: r.snapshot.ronda, cantidad_anterior: r.cantidad_anterior, cantidad_final: r.cantidad_final, revision: r.revision, motivo: r.motivo, soporte: r.soporte }))), 'Referencias');
  const locations: Record<string, unknown>[] = [];
  const counts: Record<string, unknown>[] = [];
  for (const row of rows) {
    const items = row.snapshot.ubicaciones;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      locations.push({ referencia: row.referencia, bodega: row.bodega, location_id: item.location_id, ubicacion: JSON.stringify(item.location), validacion: JSON.stringify(item.validated) });
      for (const count of item.counts ?? []) counts.push({ ...count, referencia: row.referencia, bodega: row.bodega });
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(locations), 'Ubicaciones y validaciones');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(counts), 'Conteos originales');
  XLSX.writeFile(workbook, `Backup_antes_ajustes_${inventory.replace(/[^\w-]/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
}

export function exportAjustesLote(rows: Record<string, unknown>[], fileName: string) {
  const workbook = XLSX.utils.book_new();
  // Separate rows prevent exceeding Excel's 32,767-character cell limit on multi-location references.
  const detail = rows.map(({ ubicaciones, snapshot_anterior, snapshot_posterior, ...row }) => row);
  const locations: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.ubicaciones)) continue;
    for (const item of row.ubicaciones) {
      locations.push({ referencia: row.referencia, bodega: row.bodega, location_id: item.location_id,
        cantidad_nueva: item.cantidad_nueva, creada_por_ajuste: !!item.creada_por_ajuste,
        cantidad_anterior: item.anterior?.validated?.validated_quantity ?? null,
        ronda_anterior: item.anterior?.validated?.audit_round ?? null,
        motivo_anterior: item.anterior?.validated?.reason ?? '',
        validado_por_anterior: item.anterior?.validated?.validated_by ?? '',
        ubicacion_anterior: JSON.stringify(item.anterior?.location ?? null) });
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), 'Detalle');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(locations), 'Ubicaciones');
  XLSX.writeFile(workbook, fileName);
}