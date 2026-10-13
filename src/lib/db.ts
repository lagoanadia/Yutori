// Acceso a la base de datos D1 y utilidades para mostrar sus datos.
import { env } from 'cloudflare:workers';

export const db = () => env.DB;

export async function todos<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await db().prepare(sql).bind(...params).all<T>();
  return results;
}

export async function uno<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  return db().prepare(sql).bind(...params).first<T>();
}

export const ESTADOS_TALLERISTA: Record<string, string> = {
  nueva: 'Nueva',
  revision: 'En revisión',
  aceptada: 'Aceptada',
  reserva: 'En reserva',
  descartada: 'Descartada',
};

export const ESTADOS_TALLER: Record<string, string> = {
  hueco: 'Hueco creado',
  enviado: 'Enviado por la tallerista',
  publicado: 'Publicado',
  desactivado: 'Desactivado',
};

export const ESTADOS_RESERVA: Record<string, string> = {
  pendiente: 'Pendiente de pago',
  confirmada: 'Confirmada',
  liberada: 'Liberada',
  cancelada: 'Cancelada',
};

export const ESTADOS_SOLICITUD: Record<string, string> = {
  nueva: 'Nueva',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
};

export const TIPOS_RESERVA: Record<string, string> = {
  taller: 'Taller',
  clase_mensual: 'Clase mensual',
  clase_suelta: 'Clase suelta',
};

export const FRANJAS: Record<string, string> = {
  viernes_tarde: 'Viernes tarde',
  sabado_manana: 'Sábado mañana',
  sabado_tarde: 'Sábado tarde',
  domingo_manana: 'Domingo mañana',
  domingo_tarde: 'Domingo tarde',
};

export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const euros = (cent: number | null) =>
  cent == null ? '—' : (cent / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export function fecha(iso: string | null) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const texto = new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return iso.length > 10 ? `${texto}, ${iso.slice(11, 16)}` : texto;
}
