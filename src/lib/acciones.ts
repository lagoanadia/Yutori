// Acciones de un toque del panel: cada una cambia UN dato y no toca nada más (las notas, por ejemplo, se quedan como están).
import { db, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA } from './db';

/** Marca los 25 € de la reserva como recibidos (o no). Es un valor, no un interruptor: repetirla no la deshace. */
export async function marcarPagoReserva(tallerId: number, recibido = true) {
  const r = await db()
    .prepare('UPDATE talleres SET pago_reserva_recibido = ?1 WHERE id = ?2 AND pago_reserva_recibido <> ?1')
    .bind(recibido ? 1 : 0, tallerId)
    .run();
  return r.meta.changes === 1;
}

/**
 * Cambia el estado de una petición (privado o bono) sin tocar sus notas.
 * Con `desde`, solo si sigue en ese estado: así una pantalla vieja no pisa un cambio hecho desde otro dispositivo.
 */
export async function cambiarEstadoSolicitud(id: number, estado: string, desde?: string) {
  if (!(estado in ESTADOS_SOLICITUD)) return false;
  const r = await db()
    .prepare(`UPDATE solicitudes SET estado = ?1 WHERE id = ?2 AND estado <> ?1 ${desde ? 'AND estado = ?3' : ''}`)
    .bind(estado, id, ...(desde ? [desde] : []))
    .run();
  return r.meta.changes === 1;
}

/** Cambia el estado de una tallerista sin tocar sus notas. Con `desde`, solo si sigue en ese estado. */
export async function cambiarEstadoTallerista(id: number, estado: string, desde?: string) {
  if (!(estado in ESTADOS_TALLERISTA)) return false;
  const r = await db()
    .prepare(`UPDATE talleristas SET estado = ?1 WHERE id = ?2 AND estado <> ?1 ${desde ? 'AND estado = ?3' : ''}`)
    .bind(estado, id, ...(desde ? [desde] : []))
    .run();
  return r.meta.changes === 1;
}
