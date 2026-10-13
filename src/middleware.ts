import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { usuarioDeAccess } from './lib/acceso';

/** Cabeceras de seguridad para las páginas del servidor. Las estáticas las llevan en public/_headers. */
const SEGURIDAD: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

const cabeceras = defineMiddleware(async (context, next) => {
  let respuesta = await next();
  if (context.isPrerendered) return respuesta;
  try {
    respuesta.headers.set('X-Content-Type-Options', 'nosniff');
  } catch {
    // Algunas respuestas (redirecciones) tienen cabeceras de solo lectura: se copian a una nueva.
    respuesta = new Response(respuesta.body, respuesta);
  }
  for (const [nombre, valor] of Object.entries(SEGURIDAD)) {
    if (!respuesta.headers.has(nombre)) respuesta.headers.set(nombre, valor);
  }
  // Las páginas privadas (panel, enlaces de talleristas y reservas) no se guardan en cachés compartidas.
  const { pathname } = context.url;
  if (/^\/(panel|t|reserva)(\/|$)/.test(pathname)) respuesta.headers.set('Cache-Control', 'private, no-store');
  return respuesta;
});

const panel = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (context.isPrerendered || !(pathname === '/panel' || pathname.startsWith('/panel/'))) {
    return next();
  }

  // En local (npm run dev) el panel se abre sin pantalla de acceso.
  if (import.meta.env.DEV) {
    context.locals.usuario = 'local';
    return next();
  }

  // En internet: si Access aún no está configurado, el panel no existe.
  if (!env.ACCESS_AUD) {
    return new Response('No encontrado', { status: 404 });
  }

  const usuario = await usuarioDeAccess(context.request, env.ACCESS_TEAM, env.ACCESS_AUD);
  if (!usuario) {
    return new Response('Acceso no autorizado', { status: 403 });
  }
  context.locals.usuario = usuario;
  return next();
});

export const onRequest = sequence(cabeceras, panel);
