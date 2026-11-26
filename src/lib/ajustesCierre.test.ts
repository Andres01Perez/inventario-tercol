// @ts-ignore Bun provides the test runner
import { describe, expect, it } from 'bun:test';
import * as XLSX from 'xlsx';
import { parseAjusteNumber, parseAjustesExcel, repartirAjuste, validateAjuste, type AjusteInput } from './ajustesCierre';
const row: AjusteInput = { fila: 2, referencia: 'A', bodega: 'planta', familia: 'PP', cantidad_final: 10, motivo: 'Cierre', soporte: 'Excel V280', observacion: '' };
describe('Ajustes de cierre', () => {
  it('PP sin control solo se aplica en planta', () => expect(validateAjuste({ ...row, bodega: 'almacen' }, { familia: 'PP', control: null })).toContain('PP en bodega contraria al Control'));
  it('PP controlada solo se aplica en almacén', () => expect(validateAjuste(row, { familia: 'PP', control: '1' })).toContain('PP en bodega contraria al Control'));
  it('rechaza referencia inexistente', () => expect(validateAjuste(row)).toContain('Referencia inexistente'));
  it('rechaza familia distinta', () => expect(validateAjuste(row, { familia: 'MP', control: null })).toContain('Familia distinta a la maestra'));
  it('rechaza duplicados referencia+bodega', () => expect(validateAjuste(row, { familia: 'PP', control: null }, true)).toContain('Duplicada: referencia + bodega'));
  it('rechaza cantidad negativa', () => expect(validateAjuste({ ...row, cantidad_final: -1 }, { familia: 'PP', control: null })).toContain('Cantidad vacía, inválida o negativa'));
  it('rechaza cantidad vacía', () => expect(validateAjuste({ ...row, cantidad_final: null }, { familia: 'PP', control: null })).toContain('Cantidad vacía, inválida o negativa'));
  it('exige motivo', () => expect(validateAjuste({ ...row, motivo: '' }, { familia: 'PP', control: null })).toContain('Motivo obligatorio'));
  it('exige soporte', () => expect(validateAjuste({ ...row, soporte: '' }, { familia: 'PP', control: null })).toContain('Soporte obligatorio'));
  it('acepta cero', () => expect(validateAjuste({ ...row, cantidad_final: 0 }, { familia: 'PP', control: null })).toEqual([]));
  it('acepta coma o punto decimal sin reinterpretar separadores mixtos', () => {
    expect(parseAjusteNumber('16518,81')).toBe(16518.81); expect(parseAjusteNumber('16518.81')).toBe(16518.81); expect(parseAjusteNumber('1,234.56')).toBeNull();
  });
  it('reparte proporcionalmente al último conteo', () => expect(repartirAjuste(100, [10, 30])).toEqual([25, 75]));
  it('reparte por igual si no hay cantidades', () => expect(repartirAjuste(100, [0, 0])).toEqual([50, 50]));
  it('asigna residuo a la última ubicación', () => {
    const result = repartirAjuste(10, [1, 1, 1]); expect(result[0]).toBe(3.333333); expect(result.reduce((a, b) => a + b, 0)).toBe(10);
  });
  it('lee primera hoja, normaliza encabezados y preserva referencia formateada', () => {
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet([['REFERENCIA', 'BÓDEGA', 'FAMILIA', 'CANTIDAD_FINAL', 'MOTIVO', 'SOPORTE', 'OBSERVACIÓN'], [123, 'Almacén', 'mp', '1,5', 'm', 's', '']]);
    ws.A2.z = '00000'; XLSX.utils.book_append_sheet(wb, ws, 'Ajustes');
    const parsed = parseAjustesExcel(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    expect(parsed[0]?.referencia).toBe('00123'); expect(parsed[0]?.cantidad_final).toBe(1.5); expect(parsed[0]?.bodega).toBe('almacen');
  });
});