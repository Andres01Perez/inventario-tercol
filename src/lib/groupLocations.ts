// Agrupa visualmente ubicaciones de una referencia por bodega (nombre normalizado).
// Si una bodega tiene varios puntos de referencia, se usa el de la primera ubicación registrada.
// Solo afecta la vista: los datos reales no cambian.

type Counts = { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null };

export interface GroupableRow {
  locationId: string;
  locationName: string | null;
  puntoReferencia: string | null;
  counts: Counts;
  validatedQuantity: number | null;
  validatedAtRound: number | null;
  discoveredAtRound: number | null;
}

export const normalizeBodega = (s: string | null | undefined) =>
  (s || '').trim().replace(/\s+/g, ' ').toLowerCase();

const addNullable = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : a + b;

export function groupLocationsByBodega<T extends GroupableRow>(rows: T[]): (T & { memberIds: string[] })[] {
  const map = new Map<string, T & { memberIds: string[] }>();
  for (const r of rows) {
    const key = normalizeBodega(r.locationName) || `__${r.locationId}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, { ...r, counts: { ...r.counts }, memberIds: [r.locationId] });
      continue;
    }
    g.memberIds.push(r.locationId);
    (Object.keys(g.counts) as (keyof Counts)[]).forEach((k) => {
      g.counts[k] = addNullable(g.counts[k], r.counts[k]);
    });
    g.validatedQuantity = addNullable(g.validatedQuantity, r.validatedQuantity);
    g.validatedAtRound = g.validatedAtRound === null || r.validatedAtRound === null
      ? null
      : Math.max(g.validatedAtRound, r.validatedAtRound);
  }
  return [...map.values()];
}
