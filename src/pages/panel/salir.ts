// Cerrar la sesión del panel (borra la cookie).
import type { APIRoute } from 'astro';
import { borrarCookie } from '../../lib/sesion';

export const prerender = false;

export const POST: APIRoute = () =>
  new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': borrarCookie() } });
