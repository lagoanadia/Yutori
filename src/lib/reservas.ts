// Reservas de talleres: plazas, plazo de pago y cambios de estado.
import { db, todos, uno } from './db';
import { codigoAleatorio } from './util';

/** Horas que tiene un cliente para pagar antes de que su plaza se libere. TODO: confirmar con Iris. */
export const PLAZO_PAGO_HORAS = 24;
/** Máximo de plazas por reserva. */
export const MAX_PLAZAS_RESERVA = 4;

export type TallerPublico = {
  id: number; slug: string; titulo: string; fecha: string; franja: string; hora_inicio: string; hora_fin: string;
  precio_cent: number; plazas: number; foto: string | null; texto: string; materiales: string | null; es_evento: number;
  datos_pago: string; imparte: string; ocupadas: number;
};

/** Plazas ocupadas = reservas pendientes de pago + confirmadas. */
const OCUPADAS = `(SELECT COALESCE(sum(r.plazas), 0) FROM reservas r WHERE r.taller_id = t.id AND r.estado IN ('pendiente', 'confirmada'))`;

/** Fecha de hoy en España (AAAA-MM-DD). */
export const hoyEspana = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Libera las reservas pendientes cuyo plazo de pago ya pasó. Se llama antes de contar plazas. */
export async function liberarCaducadas() {
  await db()
    .prepare(`UPDATE reservas SET estado = 'liberada'
              WHERE estado = 'pendiente' AND caduca_en IS NOT NULL AND caduca_en < strftime('%Y-%m-%dT%H:%M:%S', 'now')`)
    .run();
}

const SELECT_TALLER = `
  SELECT t.id, t.slug, t.titulo, t.fecha, t.franja, t.hora_inicio, t.hora_fin, t.precio_cent, t.plazas, t.foto, t.texto,
         t.materiales, t.es_evento, t.datos_pago, COALESCE(ta.marca, ta.nombre, 'Yutori') AS imparte, ${OCUPADAS} AS ocupadas
  FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id`;

export async function talleresPublicados(limite = 50) {
  await liberarCaducadas();
  return todos<TallerPublico>(
    `${SELECT_TALLER} WHERE t.estado = 'publicado' AND t.fecha >= ?1 ORDER BY t.fecha, t.hora_inicio LIMIT ?2`,
    hoyEspana(), limite);
}

export async function tallerPublicado(slug: string) {
  await liberarCaducadas();
  return uno<TallerPublico>(`${SELECT_TALLER} WHERE t.estado = 'publicado' AND t.slug = ?1`, slug);
}

/**
 * Crea la reserva solo si quedan plazas. La comprobación y la inserción van en UNA sentencia:
 * D1 las ejecuta de una en una, así que dos personas no pueden quedarse con la misma última plaza.
 */
export async function reservarTaller(tallerId: number, d: { nombre: string; telefono: string; email: string; plazas: number }) {
  await liberarCaducadas();
  const codigo = codigoAleatorio();
  const resultado = await db()
    .prepare(`
      INSERT INTO reservas (tipo, taller_id, nombre, telefono, email, plazas, estado, caduca_en, codigo, acepta_condiciones_en, acepta_privacidad_en)
      SELECT 'taller', t.id, ?2, ?3, ?4, ?5, 'pendiente',
             strftime('%Y-%m-%dT%H:%M:%S', 'now', ?6), ?7,
             strftime('%Y-%m-%dT%H:%M:%S', 'now'), strftime('%Y-%m-%dT%H:%M:%S', 'now')
      FROM talleres t
      WHERE t.id = ?1 AND t.estado = 'publicado' AND t.plazas - ${OCUPADAS} >= ?5`)
    .bind(tallerId, d.nombre, d.telefono, d.email, d.plazas, `+${PLAZO_PAGO_HORAS} hours`, codigo)
    .run();
  return resultado.meta.changes === 1 ? codigo : null;
}

export type ReservaDetalle = {
  id: number; codigo: string; nombre: string; telefono: string; email: string; plazas: number; estado: string;
  caduca_en: string | null; creado_en: string; taller_id: number; titulo: string; slug: string; fecha: string;
  hora_inicio: string; hora_fin: string; precio_cent: number; datos_pago: string; imparte: string;
};

export async function reservaPorCodigo(codigo: string) {
  await liberarCaducadas();
  return uno<ReservaDetalle>(`
    SELECT r.id, r.codigo, r.nombre, r.telefono, r.email, r.plazas, r.estado, r.caduca_en, r.creado_en, t.id AS taller_id,
           t.titulo, t.slug, t.fecha, t.hora_inicio, t.hora_fin, t.precio_cent, t.datos_pago,
           COALESCE(ta.marca, ta.nombre, 'Yutori') AS imparte
    FROM reservas r JOIN talleres t ON t.id = r.taller_id LEFT JOIN talleristas ta ON ta.id = t.tallerista_id
    WHERE r.codigo = ?1`, codigo);
}

/** Cambia el estado de una reserva (pago recibido o cancelación). Con tallerId, solo si es de ese taller. */
export async function cambiarEstadoReserva(id: number, accion: 'pagado' | 'cancelar', tallerId?: number) {
  const nuevo = accion === 'pagado' ? 'confirmada' : 'cancelada';
  // Una reserva liberada no se puede confirmar: su plaza puede tenerla ya otra persona.
  const desde = accion === 'pagado' ? `('pendiente')` : `('pendiente', 'confirmada')`;
  await db()
    .prepare(`UPDATE reservas SET estado = ?1, caduca_en = NULL
              WHERE id = ?2 AND estado IN ${desde} ${tallerId ? 'AND taller_id = ?3' : ''}`)
    .bind(nuevo, id, ...(tallerId ? [tallerId] : []))
    .run();
}
