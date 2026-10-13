// Emails automáticos con Resend. Sin RESEND_API_KEY no se envía nada: en local se escriben en la consola.
// Se envían "en segundo plano" (waitUntil): la persona no espera y un fallo nunca rompe una reserva.
import { env, waitUntil } from 'cloudflare:workers';
import { negocio } from '../data/yutori';

export type Email = {
  para: string;
  asunto: string;
  titulo: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
  /** A quién se responde si contestan al email. Por defecto, el email de Yutori. */
  responderA?: string;
};

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** **negrita** dentro de los párrafos. */
const conNegritas = (t: string) => escapar(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

function html(e: Email) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f3ecda;font-family:Helvetica,Arial,sans-serif;color:#24332f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf7ee;border-radius:16px;border:1px solid #d9cfb8">
<tr><td style="padding:24px 28px 8px;font-family:Georgia,serif;font-size:26px;color:#4a6f66;font-weight:bold">Yutori <span style="font-size:15px;font-style:italic;font-weight:normal">Espacio Creativo</span></td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="font-family:Georgia,serif;font-size:22px;color:#4a6f66;margin:0 0 12px">${escapar(e.titulo)}</h1>
${e.parrafos.map((p) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${conNegritas(p)}</p>`).join('')}
${e.boton ? `<p style="margin:20px 0 8px"><a href="${escapar(e.boton.url)}" style="display:inline-block;background:#4a6f66;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${escapar(e.boton.texto)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:13px;color:#52625d;border-top:1px solid #d9cfb8">${escapar(negocio.direccion)}, ${escapar(negocio.ciudad)} · ${escapar(negocio.instagramUsuario)}</td></tr>
</table></td></tr></table></body></html>`;
}

function texto(e: Email) {
  return [e.titulo, '', ...e.parrafos.map((p) => p.replace(/\*\*/g, '')), ...(e.boton ? ['', `${e.boton.texto}: ${e.boton.url}`] : []), '', `Yutori Espacio Creativo · ${negocio.direccion}, ${negocio.ciudad}`].join('\n');
}

async function enviarAhora(e: Email) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (import.meta.env.DEV) console.log(`\n[email] Para: ${e.para}\n[email] Asunto: ${e.asunto}\n${texto(e)}\n`);
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM, to: [e.para], reply_to: e.responderA ?? negocio.email,
        subject: e.asunto, html: html(e), text: texto(e),
      }),
    });
    if (!r.ok) console.error(`[email] Resend respondió ${r.status}: ${await r.text()}`);
  } catch (error) {
    console.error('[email] No se pudo enviar', error);
  }
}

/** Envía uno o varios emails sin hacer esperar a quien está usando la web. */
export function enviar(...emails: Email[]) {
  const tarea = Promise.all(emails.map(enviarAhora));
  try {
    waitUntil(tarea);
  } catch {
    // Fuera de una petición (no debería pasar): se deja correr.
  }
}
