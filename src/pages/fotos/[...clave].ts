// Fotos públicas de talleres. Las de propuestas de talleristas no se sirven aquí.
import type { APIRoute } from 'astro';
import { respuestaFoto } from '../../lib/fotos';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const clave = params.clave ?? '';
  if (!clave.startsWith('talleres/')) return new Response('No encontrada', { status: 404 });
  return respuestaFoto(clave);
};
