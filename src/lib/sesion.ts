// Acceso al panel con contraseña (mientras no haya dominio para Cloudflare Access).
// La contraseña es el secreto PANEL_CLAVE de Cloudflare. La sesión es una cookie firmada con HMAC:
// "caducidad.firma". Sin la clave no se puede fabricar una cookie válida.
import { env } from 'cloudflare:workers';

export const COOKIE_PANEL = 'yutori_panel';
const DURACION_S = 12 * 60 * 60;
const codificador = new TextEncoder();

export const claveConfigurada = () => Boolean(env.PANEL_CLAVE && env.PANEL_CLAVE.length >= 10);

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function firmar(texto: string) {
  const clave = await crypto.subtle.importKey('raw', codificador.encode(`sesion:${env.PANEL_CLAVE}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', clave, codificador.encode(texto)));
}

/** Compara dos textos sin dar pistas por el tiempo que tarda (se comparan sus resúmenes SHA-256). */
async function iguales(a: string, b: string) {
  const [ha, hb] = await Promise.all([a, b].map((t) => crypto.subtle.digest('SHA-256', codificador.encode(t))));
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diferencia = 0;
  for (let i = 0; i < x.length; i++) diferencia |= x[i] ^ y[i];
  return diferencia === 0;
}

export const claveCorrecta = (intento: string) => (claveConfigurada() ? iguales(intento, env.PANEL_CLAVE) : Promise.resolve(false));

export async function crearCookie() {
  const caduca = Math.floor(Date.now() / 1000) + DURACION_S;
  const valor = `${caduca}.${await firmar(String(caduca))}`;
  return `${COOKIE_PANEL}=${valor}; Path=/panel; Max-Age=${DURACION_S}; HttpOnly; Secure; SameSite=Strict`;
}

export const borrarCookie = () => `${COOKIE_PANEL}=; Path=/panel; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export async function sesionValida(valor: string | undefined) {
  if (!valor || !claveConfigurada()) return false;
  const [caduca, firma] = valor.split('.');
  if (!caduca || !firma || Number(caduca) < Date.now() / 1000) return false;
  return iguales(firma, await firmar(caduca));
}
