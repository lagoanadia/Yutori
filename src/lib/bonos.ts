// Bonos regalo comprados en la web: alta, pago con tarjeta, código para regalar, caducidad a los 3 meses y canje.
import { db, uno } from './db';
import { stripe, stripeActivo } from './stripe';
import { avisoBonoPagado, avisoSolicitud } from './avisos';
import { hoyEspana } from './reservas';

/** Meses que vale un bono desde que se paga (lo dice la web: «válidos durante 3 meses»). */
export const MESES_VALIDEZ = 3;

export type Bono = {
  id: number; nombre: string; email: string; para_quien: string | null; tipo_bono: string; detalle: string; importe_cent: number | null;
  codigo_bono: string | null; pagada_en: string | null; caduca_bono: string | null; canjeado_en: string | null; estado: string;
};

/** Código fácil de dictar: sin 0/O ni 1/I/L. */
export function codigoBono() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const azar = crypto.getRandomValues(new Uint8Array(8));
  const c = [...azar].map((b) => letras[b % letras.length]).join('');
  return `BONO-${c.slice(0, 4)}-${c.slice(4)}`;
}

type DatosBono = { nombre: string; email: string; telefono: string; tipo: 'taller' | 'importe'; detalle: string; para: string; importeCent: number | null };

/** Guarda la petición de bono. Sin importe (taller sin elegir) o sin Stripe, avisa como antes para gestionarlo a mano. */
export async function crearBono(d: DatosBono) {
  const fila = await db()
    .prepare(`INSERT INTO solicitudes (tipo, nombre, email, telefono, tipo_bono, detalle, para_quien, importe_cent, acepta_privacidad_en)
              VALUES ('bono', ?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%S', 'now')) RETURNING id`)
    .bind(d.nombre, d.email, d.telefono, d.tipo, d.detalle, d.para, d.importeCent)
    .first<{ id: number }>();
  if (!fila) return null;
  const pagaEnLaWeb = stripeActivo() && d.importeCent != null;
  if (!pagaEnLaWeb) await avisoSolicitud(fila.id);
  return { id: fila.id, pagaEnLaWeb };
}

/** Abre el pago con tarjeta del bono y devuelve la dirección de la página de pago de Stripe. */
export async function iniciarPagoBono(id: number, origen: string) {
  const b = await uno<Bono>(`SELECT * FROM solicitudes WHERE id = ?1 AND tipo = 'bono' AND pagada_en IS NULL`, id);
  if (!b?.importe_cent) return null;
  const nombre = `Bono regalo Yutori · ${b.tipo_bono === 'importe' ? 'importe' : b.detalle}`;
  const sesion = await stripe<{ id: string; url: string }>('POST', 'checkout/sessions', {
    mode: 'payment', locale: 'es', adaptive_pricing: { enabled: false }, customer_email: b.email,
    metadata: { bono: String(b.id) },
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: b.importe_cent, product_data: { name: nombre } } }],
    payment_intent_data: { description: nombre, metadata: { bono: String(b.id) } },
    success_url: `${origen}/bonos?bono=${b.id}&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origen}/bonos`,
  });
  await db().prepare(`UPDATE solicitudes SET stripe_sesion = ?2 WHERE id = ?1`).bind(id, sesion.id).run();
  return sesion.url;
}

/**
 * Marca pagado el bono de un pago de Stripe ya cobrado, le pone código y caducidad y lo envía por email.
 * Si llegan el aviso de Stripe y la vuelta a la web, el segundo no hace nada. Devuelve el código del bono.
 */
export async function confirmarPagoBono(id: number, pagoId: string) {
  // Reintenta si el código aleatorio coincidiera con otro (índice único).
  for (let intento = 0; intento < 3; intento++) {
    try {
      const hecho = await db()
        .prepare(`UPDATE solicitudes SET pagada_en = strftime('%Y-%m-%dT%H:%M:%S', 'now'), stripe_pago = ?2, codigo_bono = ?3,
                    caduca_bono = date(?4, '+${MESES_VALIDEZ} months'), estado = 'cerrada'
                  WHERE id = ?1 AND tipo = 'bono' AND pagada_en IS NULL RETURNING codigo_bono`)
        .bind(id, pagoId, codigoBono(), hoyEspana())
        .first<{ codigo_bono: string }>();
      if (hecho) {
        await avisoBonoPagado(id);
        return hecho.codigo_bono;
      }
      break;
    } catch (e) {
      if (!String(e).includes('UNIQUE') || intento === 2) throw e;
    }
  }
  return (await uno<{ codigo_bono: string | null }>(`SELECT codigo_bono FROM solicitudes WHERE id = ?1`, id))?.codigo_bono ?? null;
}

/** Comprueba en Stripe la sesión de pago de un bono y, si está pagada, lo confirma. Devuelve el código o null. */
export async function confirmarSesionBono(id: number, sesionId: string) {
  const b = await uno<{ stripe_sesion: string | null; codigo_bono: string | null }>(`SELECT stripe_sesion, codigo_bono FROM solicitudes WHERE id = ?1`, id);
  if (b?.codigo_bono) return b.codigo_bono;
  if (!b?.stripe_sesion || b.stripe_sesion !== sesionId) return null;
  const s = await stripe<{ payment_status: string; payment_intent: string | null }>('GET', `checkout/sessions/${encodeURIComponent(sesionId)}`);
  return s.payment_status === 'paid' && s.payment_intent ? confirmarPagoBono(id, s.payment_intent) : null;
}

export const bonoPorCodigo = (codigo: string) => uno<Bono>(`SELECT * FROM solicitudes WHERE codigo_bono = ?1 AND tipo = 'bono'`, codigo);

/** Marca un bono como usado (o lo deshace). */
export async function canjearBono(id: number, canjeado: boolean) {
  await db()
    .prepare(`UPDATE solicitudes SET canjeado_en = CASE WHEN ?2 THEN strftime('%Y-%m-%dT%H:%M:%S', 'now') END WHERE id = ?1 AND codigo_bono IS NOT NULL`)
    .bind(id, canjeado ? 1 : 0)
    .run();
}
