import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { usuarioDeAccess } from './lib/acceso';

export const onRequest = defineMiddleware(async (context, next) => {
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
