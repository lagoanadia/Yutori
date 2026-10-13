// Cloudflare Turnstile: comprueba en el servidor que quien envía el formulario no es un bot.
import { env } from 'cloudflare:workers';

export const turnstileActivo = () => Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);

export async function verificarTurnstile(token: FormDataEntryValue | null, ip: string | null) {
  // Sin claves configuradas, solo protege la trampa invisible (campo "web") del formulario.
  if (!turnstileActivo()) return true;
  if (typeof token !== 'string' || !token) return false;

  const cuerpo = new FormData();
  cuerpo.append('secret', env.TURNSTILE_SECRET);
  cuerpo.append('response', token);
  if (ip) cuerpo.append('remoteip', ip);

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: cuerpo });
    const datos = (await r.json()) as { success?: boolean };
    return datos.success === true;
  } catch {
    return false;
  }
}
