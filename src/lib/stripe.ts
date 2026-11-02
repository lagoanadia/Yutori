// Pagos con tarjeta con Stripe: llamadas a su API (fetch, sin librería) y comprobación de la firma de sus avisos (webhook).
// Las claves van como secretos de Cloudflare: STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET. Sin clave, la web sigue con el pago
// fuera de la web (Bizum o en el espacio) como antes.
import { env } from 'cloudflare:workers';

/** Si los pagos con tarjeta están activos (hay clave de Stripe). */
export const stripeActivo = () => Boolean(env.STRIPE_SECRET_KEY);

type Valor = string | number | boolean | null | undefined;
interface Parametros { [clave: string]: Valor | Parametros | Parametros[] | string[] }

/** Convierte un objeto anidado al formato de formulario de Stripe: a[b][0][c]=valor. */
export function aFormulario(datos: Parametros, prefijo = ''): string[] {
  return Object.entries(datos).flatMap(([clave, valor]) => {
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
    if (valor == null) return [];
    if (Array.isArray(valor)) {
      return valor.flatMap((v, i) => (typeof v === 'object' ? aFormulario(v, `${nombre}[${i}]`) : [`${encodeURIComponent(`${nombre}[${i}]`)}=${encodeURIComponent(v)}`]));
    }
    if (typeof valor === 'object') return aFormulario(valor, nombre);
    return [`${encodeURIComponent(nombre)}=${encodeURIComponent(String(valor))}`];
  });
}

export class ErrorStripe extends Error {
  constructor(mensaje: string, readonly codigo: string | null, readonly datos: unknown) {
    super(mensaje);
  }
}

/** Llama a la API de Stripe. `idempotencia` evita cobrar dos veces lo mismo si la llamada se repite. */
export async function stripe<T = Record<string, unknown>>(metodo: 'GET' | 'POST', ruta: string, datos: Parametros = {}, idempotencia?: string) {
  const cuerpo = aFormulario(datos).join('&');
  const url = `https://api.stripe.com/v1/${ruta}${metodo === 'GET' && cuerpo ? `?${cuerpo}` : ''}`;
  const respuesta = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencia ? { 'Idempotency-Key': idempotencia } : {}),
    },
    body: metodo === 'POST' ? cuerpo : undefined,
  });
  const json = (await respuesta.json()) as T & { error?: { message: string; code?: string; decline_code?: string } };
  if (!respuesta.ok || json.error) {
    throw new ErrorStripe(json.error?.message ?? `Stripe respondió ${respuesta.status}`, json.error?.decline_code ?? json.error?.code ?? null, json);
  }
  return json;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Comprueba la cabecera `Stripe-Signature` de un aviso: HMAC-SHA256 de «marca.cuerpo» con el secreto del webhook.
 * Se rechazan avisos de más de 5 minutos para que no se puedan reenviar uno viejo.
 */
export async function firmaValida(cuerpo: string, cabecera: string | null, secreto: string, ahora = Date.now()) {
  if (!cabecera || !secreto) return false;
  const partes = cabecera.split(',').map((p) => p.split('='));
  const marca = partes.find(([k]) => k === 't')?.[1];
  const firmas = partes.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!marca || firmas.length === 0 || Math.abs(ahora / 1000 - Number(marca)) > 300) return false;
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperada = hex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${marca}.${cuerpo}`)));
  // Comparación de tiempo constante.
  return firmas.some((f) => f.length === esperada.length && [...f].reduce((d, c, i) => d | (c.charCodeAt(0) ^ esperada.charCodeAt(i)), 0) === 0);
}
