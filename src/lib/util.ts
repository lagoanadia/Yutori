// Utilidades sin dependencias: códigos secretos, slugs y fechas de talleres.

/** Código aleatorio seguro para URLs (base64url). 18 bytes ≈ 24 caracteres. */
export function codigoAleatorio(bytes = 18) {
  const datos = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...datos)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function slugify(texto: string) {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60);
}

const aUTC = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const aISO = (f: Date) => f.toISOString().slice(0, 10);

/** Día de la semana ISO: 1 lunes … 7 domingo. */
export function diaSemana(iso: string) {
  return aUTC(iso).getUTCDay() || 7;
}

/** Franjas posibles según el día: viernes tarde, sábado y domingo mañana o tarde. */
export function franjasDeFecha(iso: string): string[] {
  switch (diaSemana(iso)) {
    case 5: return ['viernes_tarde'];
    case 6: return ['sabado_manana', 'sabado_tarde'];
    case 7: return ['domingo_manana', 'domingo_tarde'];
    default: return [];
  }
}

/**
 * Fecha límite para que la tallerista envíe su taller: el miércoles anterior al día 20
 * del mes previo al taller (Iris publica el calendario el día 20).
 */
export function fechaLimite(isoTaller: string) {
  const t = aUTC(isoTaller);
  const limite = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 19));
  while (limite.getUTCDay() !== 3) limite.setUTCDate(limite.getUTCDate() - 1);
  return aISO(limite);
}

export const esHora = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
export const esEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const esFecha = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(aUTC(f).getTime());

/** Teléfono español para wa.me: solo dígitos y con 34 delante si tiene 9 cifras. */
export function telefonoWhatsApp(tel: string | null) {
  const digitos = (tel ?? '').replace(/\D/g, '');
  if (digitos.length === 9) return `34${digitos}`;
  return digitos.length >= 11 ? digitos : '';
}
