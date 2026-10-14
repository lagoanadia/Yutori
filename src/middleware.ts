import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { usuarioDeAccess } from './lib/acceso';
import { claveConfigurada, COOKIE_PANEL, sesionValida } from './lib/sesion';

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
  // El panel usa el micrófono para el botón «Dictar» del asistente. El resto de la web lo sigue teniendo bloqueado.
  if (/^\/panel(\/|$)/.test(pathname)) respuesta.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  return respuesta;
});

const panel = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (context.isPrerendered || !(pathname === '/panel' || pathname.startsWith('/panel/'))) {
    return next();
  }

  // En local (npm run dev) el panel se abre sin pantalla de acceso (salvo que haya PANEL_CLAVE en .dev.vars, para probarla).
  if (import.meta.env.DEV && !claveConfigurada()) {
    context.locals.usuario = 'local';
    return next();
  }

  // 1) Con dominio: Cloudflare Access (código por email).
  if (env.ACCESS_AUD) {
    const usuario = await usuarioDeAccess(context.request, env.ACCESS_TEAM, env.ACCESS_AUD);
    if (!usuario) return new Response('Acceso no autorizado', { status: 403 });
    context.locals.usuario = usuario;
    return next();
  }

  // 2) Sin dominio: contraseña del panel (secreto PANEL_CLAVE).
  if (claveConfigurada()) {
    if (pathname === '/panel/entrar') return next();
    if (await sesionValida(context.cookies.get(COOKIE_PANEL)?.value)) {
      context.locals.usuario = 'clave';
      return next();
    }
    return context.redirect(`/panel/entrar?volver=${encodeURIComponent(pathname + context.url.search)}`, 303);
  }

  // 3) Sin ninguna de las dos: el panel no existe en internet.
  return new Response('No encontrado', { status: 404 });
});

export const onRequest = sequence(cabeceras, panel);
