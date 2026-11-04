// Globos del menú del panel: cuántas cosas esperan en cada apartado. Una sola consulta ligera por página.
import { uno } from './db';
import { hoyEspana } from './reservas';

export type Pendientes = { talleristas: number; talleres: number; reservas: number; clases: number; solicitudes: number; personas: number };

/**
 * Números de pendientes por apartado. Ignora las reservas con el plazo vencido (se liberan al abrir su pantalla)
 * y los bonos que alguien empezó a pagar con tarjeta y no terminó.
 */
export async function pendientesDelMenu(): Promise<Pendientes> {
  const f = await uno<Record<keyof Pendientes, number>>(`
    SELECT
      (SELECT count(*) FROM talleristas WHERE estado = 'nueva') AS talleristas,
      (SELECT count(*) FROM talleres t WHERE t.fecha >= ?1 AND (t.estado = 'enviado'
         OR (t.estado = 'hueco' AND t.tallerista_id IS NOT NULL AND t.pago_reserva_recibido = 0))) AS talleres,
      (SELECT count(*) FROM reservas WHERE estado = 'pendiente' AND (caduca_en IS NULL OR caduca_en >= strftime('%Y-%m-%dT%H:%M:%S', 'now'))) AS reservas,
      (SELECT count(*) FROM reservas WHERE estado = 'pendiente' AND tipo <> 'taller'
         AND (caduca_en IS NULL OR caduca_en >= strftime('%Y-%m-%dT%H:%M:%S', 'now'))) AS clases,
      (SELECT count(*) FROM solicitudes WHERE estado = 'nueva'
         AND NOT (stripe_sesion IS NOT NULL AND pagada_en IS NULL)) AS solicitudes`, hoyEspana());
  const p = { talleristas: f?.talleristas ?? 0, talleres: f?.talleres ?? 0, reservas: f?.reservas ?? 0, clases: f?.clases ?? 0, solicitudes: f?.solicitudes ?? 0 };
  // Personas agrupa reservas, talleristas y peticiones de privados y bonos.
  return { ...p, personas: p.reservas + p.talleristas + p.solicitudes };
}
