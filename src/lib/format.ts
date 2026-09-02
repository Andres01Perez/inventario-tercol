// Utilidades compartidas de formato numérico/monetario (es-CO)

const qtyFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Cantidad con máximo 1 decimal (elimina decimales largos tipo 269.0000). */
export const formatQty = (value: number | null | undefined): string =>
  qtyFormatter.format(value ?? 0);

/** Cantidad con máximo 1 decimal y signo explícito (+2 / −2 / 0). */
export const formatSignedQty = (value: number | null | undefined): string => {
  const v = value ?? 0;
  const formatted = qtyFormatter.format(Math.abs(v));
  if (v > 0) return `+${formatted}`;
  if (v < 0) return `−${formatted}`;
  return qtyFormatter.format(0);
};

/** Dinero COP sin decimales. */
export const formatMoney = (value: number | null | undefined): string =>
  moneyFormatter.format(value ?? 0);

/** Dinero COP con signo explícito (+$1.234 / −$1.234 / $0). */
export const formatSignedMoney = (value: number | null | undefined): string => {
  const v = value ?? 0;
  const formatted = moneyFormatter.format(Math.abs(v));
  if (v > 0) return `+${formatted}`;
  if (v < 0) return `−${formatted}`;
  return moneyFormatter.format(0);
};

/** Clase de color semántica para un descuadre: verde sobrante, rojo faltante, neutro en cero. */
export const descuadreColorClass = (value: number | null | undefined): string => {
  const v = value ?? 0;
  if (v > 0) return 'text-green-600 dark:text-green-400';
  if (v < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
};
