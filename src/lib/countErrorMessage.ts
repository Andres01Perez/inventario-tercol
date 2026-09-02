// Traduce errores de guardado de conteos a mensajes claros para el supervisor.
export function friendlyCountError(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? '';
  if (msg.includes('ya fue validada')) {
    return 'Esta ubicación ya fue validada y cerrada. No se puede volver a contar.';
  }
  return msg || 'Error desconocido al guardar el conteo';
}
