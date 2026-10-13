// Cualquier foto (también las de propuestas), solo desde el panel: el middleware ya exige acceso.
import type { APIRoute } from 'astro';
import { respuestaFoto } from '../../../lib/fotos';

export const prerender = false;

export const GET: APIRoute = ({ params }) => respuestaFoto(params.clave ?? '');
