// @ts-ignore bun:test is provided by the Bun test runner
import { describe, it, expect } from 'bun:test';
import * as XLSX from 'xlsx';
import {
  parseCostUpdateExcel,
  buildCostUpdatePreview,
  type MasterCostRecord,
} from './costUpdate';

function makeExcelBuffer(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('costUpdate', () => {
  it('normaliza referencias (trim + mayúsculas), calcula costo_t y var %', () => {
    const buf = makeExcelBuffer([
      ['Referencia', 'CostoU'],
      ['  abc-01 ', 150],
      ['XYZ-02', 200],
    ]);
    const parsed = parseCostUpdateExcel(buf);
    expect(parsed.error).toBeNull();

    const master = new Map<string, MasterCostRecord>([
      ['ABC-01', { referencia: 'ABC-01', costoActual: 100, cantTotal: 10, costoTActual: 1000 }],
      ['XYZ-02', { referencia: 'XYZ-02', costoActual: 200, cantTotal: 5, costoTActual: 1000 }],
    ]);

    const preview = buildCostUpdatePreview(parsed.rows, master);
    expect(preview.toUpdate).toHaveLength(1);
    expect(preview.toUpdate[0]?.referencia).toBe('ABC-01');
    expect(preview.toUpdate[0]?.costoTNuevo).toBe(1500);
    expect(preview.toUpdate[0]?.varPct).toBeCloseTo(50, 5);
    expect(preview.unchanged).toHaveLength(1);
  });

  it('excluye referencias duplicadas, no encontradas e inválidas', () => {
    const buf = makeExcelBuffer([
      ['Referencia', 'CostoU'],
      ['DUP-1', 100],
      [' dup-1 ', 120],
      ['NO-EXISTE', 50],
      ['NEG-1', -10],
      ['TEXT-1', 'abc'],
    ]);
    const parsed = parseCostUpdateExcel(buf);
    expect(parsed.error).toBeNull();

    const master = new Map<string, MasterCostRecord>([
      ['DUP-1', { referencia: 'DUP-1', costoActual: 80, cantTotal: 2, costoTActual: 160 }],
    ]);

    const preview = buildCostUpdatePreview(parsed.rows, master);
    expect(preview.toUpdate).toHaveLength(0);
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.duplicates[0]?.refNorm).toBe('DUP-1');
    expect(preview.notFound).toHaveLength(1);
    expect(preview.notFound[0]?.referencia).toBe('NO-EXISTE');
    expect(preview.invalid).toHaveLength(2);
  });
});