// Cobros con tarjeta: pago al reservar (página de pago de Stripe), confirmación (aviso de Stripe o vuelta a la web)
// y cobro automático de las plazas mensuales renovadas el día 1.
import { db, todos, uno } from './db';
import { stripe, stripeActivo } from './stripe';
import { avisoCobroFallido, avisoPagoDevuelto, avisoPagoConfirmado, avisoReservaPagada } from './avisos';
import { actualizarCalendario } from './calendario';
import { meses, nombreMes } from './clases';
import { fechaLarga } from '../data/yutori';
import { PLAZO_PAGO_TARJETA_MIN } from './reservas';

const AHORA = `strftime('%Y-%m-%dT%H:%M:%S', 'now')`;

type ParaPagar = {
  id: number; codigo: string; tipo: string; estado: string; importe_cent: number | null; email: string; caduca_en: string | null;
  stripe_cliente: string | null; titulo: string; mes: string | null; fecha: string | null; plazas: number;
};

/** Concepto que se ve en la página de pago y en el extracto. */
const concepto = (r: ParaPagar) =>
  r.tipo === 'clase_mensual' ? `${r.titulo} · ${nombreMes(r.mes!)}`
  : r.tipo === 'clase_suelta' ? `${r.titulo} · clase suelta · ${fechaLarga(r.fecha!)}`
  : `${r.titulo} · ${fechaLarga(r.fecha!)}${r.plazas > 1 ? ` · ${r.plazas} plazas` : ''}`;

/**
 * Abre el pago con tarjeta de una reserva pendiente y devuelve la dirección de la página de pago de Stripe.
 * Si la plaza tiene plazo, se alarga mientras se paga (Stripe no cierra un pago antes de 30 minutos).
 * Las mensuales guardan la tarjeta para cobrar las renovaciones del día 1.
 */
export async function iniciarPago(codigo: string, origen: string) {
  if (!stripeActivo()) return null;
  const r = await uno<ParaPagar>(`
    SELECT r.id, r.codigo, r.tipo, r.estado, r.importe_cent, r.email, r.caduca_en, r.stripe_cliente, r.mes, r.plazas,
           COALESCE(t.titulo, c.nombre) AS titulo, COALESCE(t.fecha, r.fecha_sesion) AS fecha
    FROM reservas r LEFT JOIN talleres t ON t.id = r.taller_id
    LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id
    WHERE r.codigo = ?1`, codigo);
  if (!r || r.estado !== 'pendiente' || !r.importe_cent) return null;
  if (r.caduca_en) {
    const alargada = await db()
      .prepare(`UPDATE reservas SET caduca_en = max(caduca_en, strftime('%Y-%m-%dT%H:%M:%S', 'now', ?2))
                WHERE id = ?1 AND estado = 'pendiente'`)
      .bind(r.id, `+${PLAZO_PAGO_TARJETA_MIN} minutes`)
      .run();
    if (alargada.meta.changes !== 1) return null;
  }
  const mensual = r.tipo === 'clase_mensual';
  const nombre = concepto(r);
  const sesion = await stripe<{ id: string; url: string }>('POST', 'checkout/sessions', {
    mode: 'payment',
    locale: 'es',
    // Siempre en euros: sin la conversión a la moneda del cliente (Stripe le cobraría un 4 % extra).
    adaptive_pricing: { enabled: false },
    client_reference_id: r.codigo,
    metadata: { codigo: r.codigo },
    ...(r.stripe_cliente ? { customer: r.stripe_cliente } : { customer_email: r.email, ...(mensual ? { customer_creation: 'always' } : {}) }),
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: r.importe_cent, product_data: { name: nombre } } }],
    payment_intent_data: { description: nombre, metadata: { codigo: r.codigo }, ...(mensual ? { setup_future_usage: 'off_session' } : {}) },
    success_url: `${origen}/reserva/${r.codigo}?pago=ok`,
    cancel_url: `${origen}/reserva/${r.codigo}`,
    ...(r.caduca_en ? { expires_at: Math.floor(Date.now() / 1000) + 30 * 60 } : {}),
  });
  await db().prepare(`UPDATE reservas SET stripe_sesion = ?2 WHERE id = ?1`).bind(r.id, sesion.id).run();
  return sesion.url;
}

type Sesion = {
  id: string; payment_status: string; customer: string | null; metadata: { codigo?: string };
  payment_intent: { id: string; payment_method: { id: string; card?: { brand: string; last4: string } } | null } | null;
};

/**
 * Confirma la reserva de un pago de Stripe ya cobrado. Sirve para el aviso de Stripe y para la vuelta a la web: si llegan
 * los dos, el segundo no hace nada. Si la plaza ya no estaba pendiente (liberada, cancelada o pagada con otro pago),
 * se devuelve el dinero. Devuelve true si la reserva queda pagada con este pago.
 */
export async function confirmarPago(sesionId: string) {
  const s = await stripe<Sesion>('GET', `checkout/sessions/${encodeURIComponent(sesionId)}`, { expand: ['payment_intent.payment_method'] });
  const codigo = s.metadata?.codigo;
  const pago = s.payment_intent;
  if (s.payment_status !== 'paid' || !codigo || !pago) return false;
  const tarjeta = pago.payment_method?.card ? `${pago.payment_method.card.brand} ···· ${pago.payment_method.card.last4}` : null;
  const hecha = await db()
    .prepare(`
      UPDATE reservas SET estado = 'confirmada', caduca_en = NULL, metodo_pago = 'tarjeta', stripe_pago = ?2, pagada_en = ${AHORA},
             stripe_cliente = COALESCE(?3, stripe_cliente), tarjeta = COALESCE(?5, tarjeta), cobro_error = NULL,
             stripe_metodo = CASE WHEN tipo = 'clase_mensual' THEN COALESCE(?4, stripe_metodo) ELSE stripe_metodo END
      WHERE codigo = ?1 AND estado = 'pendiente'
      RETURNING taller_id`)
    .bind(codigo, pago.id, s.customer, pago.payment_method?.id ?? null, tarjeta)
    .first<{ taller_id: number | null }>();
  if (hecha) {
    await avisoReservaPagada(codigo);
    actualizarCalendario(hecha.taller_id);
    return true;
  }
  const actual = await uno<{ estado: string; stripe_pago: string | null }>(`SELECT estado, stripe_pago FROM reservas WHERE codigo = ?1`, codigo);
  if (actual?.stripe_pago === pago.id) return true;
  // Pagó una plaza que ya no podía ser suya (o la pagó dos veces): se le devuelve el dinero entero.
  await stripe('POST', 'refunds', { payment_intent: pago.id, metadata: { codigo } }, `devolucion-${pago.id}`);
  await avisoPagoDevuelto(codigo);
  return false;
}

/**
 * Cobro automático (desde el día 1): las plazas mensuales renovadas de este mes, pendientes y con tarjeta guardada.
 * Cada reserva se marca antes de cobrarla, así que dos tareas a la vez no cobran dos veces (y Stripe recibe además una
 * clave de idempotencia). Si un cobro falla, la plaza se guarda: se avisa a la alumna y a Yutori y se gestiona a mano.
 */
export async function cobrarRenovaciones() {
  if (!stripeActivo()) return { cobradas: 0, fallidas: 0 };
  // Con milisegundos: el momento del intento forma la clave de idempotencia y un reintento rápido no debe repetirla.
  const marcadas = await todos<{ id: number }>(`
    UPDATE reservas SET cobro_intentado_en = strftime('%Y-%m-%dT%H:%M:%f', 'now')
    WHERE tipo = 'clase_mensual' AND mes = ?1 AND estado = 'pendiente' AND metodo_pago = 'tarjeta' AND renovada_de IS NOT NULL
      AND stripe_cliente IS NOT NULL AND stripe_metodo IS NOT NULL AND importe_cent > 0 AND cobro_intentado_en IS NULL
    RETURNING id`, meses().actual);
  if (marcadas.length === 0) return { cobradas: 0, fallidas: 0 };
  const lista = await todos<{ id: number; codigo: string; cobro_intentado_en: string; importe_cent: number; stripe_cliente: string; stripe_metodo: string; titulo: string; mes: string }>(`
    SELECT r.id, r.codigo, r.cobro_intentado_en, r.importe_cent, r.stripe_cliente, r.stripe_metodo, r.mes, c.nombre AS titulo
    FROM reservas r JOIN grupos g ON g.id = r.grupo_id JOIN clases c ON c.id = g.clase_id
    WHERE r.id IN (${marcadas.map((m) => Number(m.id)).join(',')})`);
  let cobradas = 0;
  for (const r of lista) {
    try {
      // La clave de idempotencia cambia en cada intento: si no, Stripe repetiría la respuesta del intento fallido.
      const pago = await stripe<{ id: string; status: string }>('POST', 'payment_intents', {
        amount: r.importe_cent, currency: 'eur', customer: r.stripe_cliente, payment_method: r.stripe_metodo,
        off_session: true, confirm: true, description: `${r.titulo} · ${nombreMes(r.mes)}`, metadata: { codigo: r.codigo },
      }, `renovacion-${r.id}-${r.cobro_intentado_en}`);
      if (pago.status !== 'succeeded') throw new Error(`El pago quedó en estado «${pago.status}»`);
      await db()
        .prepare(`UPDATE reservas SET estado = 'confirmada', stripe_pago = ?2, pagada_en = ${AHORA}, cobro_error = NULL WHERE id = ?1 AND estado = 'pendiente'`)
        .bind(r.id, pago.id)
        .run();
      await avisoPagoConfirmado(r.codigo);
      cobradas++;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      await db().prepare(`UPDATE reservas SET cobro_error = ?2 WHERE id = ?1`).bind(r.id, motivo.slice(0, 300)).run();
      await avisoCobroFallido(r.codigo);
    }
  }
  return { cobradas, fallidas: lista.length - cobradas };
}

/** Vuelve a intentar el cobro automático de una plaza cuyo cobro falló (desde el panel). */
export async function reintentarCobro(id: number) {
  await db()
    .prepare(`UPDATE reservas SET cobro_intentado_en = NULL, cobro_error = NULL WHERE id = ?1 AND estado = 'pendiente' AND metodo_pago = 'tarjeta'`)
    .bind(id)
    .run();
  return cobrarRenovaciones();
}
