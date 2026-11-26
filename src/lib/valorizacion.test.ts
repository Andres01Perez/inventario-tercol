// @ts-ignore bun:test is provided by the Bun test runner
import { describe, expect, it } from 'bun:test';
import {
  checkValorizacionIntegrity,
  sortDetailForExport,
  summarizeFromServer,
  summarizeValorizacion,
  ValorizacionResumenRow,
  ValorizacionRow,
} from './valorizacion';

const makeRow = (overrides: Partial<ValorizacionRow>): ValorizacionRow => ({
  referencia: 'REF-1',
  familia: 'MP',
  bodega: 'almacen',
  control: null,
  erp_bodega: 10,
  costo_u: 100,
  sin_costo: false,
  cant_a_montar: 8,
  estado: 'auditado',
  num_ubicaciones: 1,
  valor_inicial: 1000,
  valor_a_montar: 800,
  dif_valor: -200,
  cant_validada_inactivas: 0,
  ...overrides,
});

describe('checkValorizacionIntegrity', () => {
  const resumen: ValorizacionResumenRow[] = [
    {
      familia: 'MP',
      bodega: 'almacen',
      referencias: 2,
      total_inv_inicial: 2000,
      total_inv_a_montar: 1900,
      costo_dif_negativa: -200,
      costo_dif_positiva: 100,
    },
  ];

  it('passes when row count and net value match', () => {
    const detail = [
      makeRow({ referencia: 'A', dif_valor: -200 }),
      makeRow({ referencia: 'B', dif_valor: 100 }),
    ];
    const res = checkValorizacionIntegrity(detail, resumen);
    expect(res.isOk).toBe(true);
    expect(res.loadedCount).toBe(2);
    expect(res.expectedCount).toBe(2);
  });

  it('blocks when loaded rows differ from expected rows', () => {
    const detail = [makeRow({ referencia: 'A', dif_valor: -100 })];
    const res = checkValorizacionIntegrity(detail, resumen);
    expect(res.isOk).toBe(false);
    expect(res.countOk).toBe(false);
  });

  it('blocks when detail dif_valor sum differs from server net diff by more than 1', () => {
    const detail = [
      makeRow({ referencia: 'A', dif_valor: -200 }),
      makeRow({ referencia: 'B', dif_valor: 95 }),
    ];
    const res = checkValorizacionIntegrity(detail, resumen);
    expect(res.isOk).toBe(false);
    expect(res.countOk).toBe(true);
    expect(res.valueOk).toBe(false);
  });
});

describe('sortDetailForExport', () => {
  it('orders rows by familia, bodega, referencia', () => {
    const rows = [
      makeRow({ familia: 'PP', bodega: 'planta', referencia: 'B' }),
      makeRow({ familia: 'MP', bodega: 'planta', referencia: 'A' }),
      makeRow({ familia: 'PP', bodega: 'almacen', referencia: 'A' }),
      makeRow({ familia: 'MP', bodega: 'almacen', referencia: 'B' }),
      makeRow({ familia: 'MP', bodega: 'almacen', referencia: 'A' }),
    ];
    const sorted = sortDetailForExport(rows);
    expect(sorted.map((r) => `${r.familia}-${r.bodega}-${r.referencia}`)).toEqual([
      'MP-almacen-A',
      'MP-almacen-B',
      'MP-planta-A',
      'PP-almacen-A',
      'PP-planta-B',
    ]);
  });
});

describe('Ajustes en valorización', () => {
  it('desglosa solo el valor a montar con origen ajuste_cierre', () => {
    expect(summarizeValorizacion([makeRow({ origen: 'ajuste_cierre', valor_a_montar: 800 }), makeRow({ origen: 'validado', valor_a_montar: 900 })]).valorAjustes).toBe(800);
  });
  it('respeta familia y bodega para el desglose del servidor', () => {
    const rows: ValorizacionResumenRow[] = [
      { familia: 'MP', bodega: 'almacen', referencias: 1, total_inv_inicial: 1000, total_inv_a_montar: 800, costo_dif_negativa: -200, costo_dif_positiva: 0, valor_ajustes_cierre: 800 },
      { familia: 'PP', bodega: 'planta', referencias: 1, total_inv_inicial: 1000, total_inv_a_montar: 900, costo_dif_negativa: -100, costo_dif_positiva: 0, valor_ajustes_cierre: 900 },
    ];
    expect(summarizeFromServer(rows, 'almacen', 'MP').valorAjustes).toBe(800);
    expect(summarizeFromServer(rows).valorAjustes).toBe(1700);
  });
});