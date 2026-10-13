// Mapa del sitio para Google: páginas públicas y talleres publicados.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { talleresPublicados } from '../lib/reservas';

export const prerender = false;

const PAGINAS = ['/', '/clases/', '/talleres/', '/privados', '/bonos', '/colabora', '/espacio/', '/condiciones/'];

export const GET: APIRoute = async ({ url }) => {
  const sitio = env.SITIO_URL || url.origin;
  const talleres = await talleresPublicados(200);
  const direcciones = [...PAGINAS, ...talleres.map((t) => `/talleres/${t.slug}`)]
    .map((ruta) => `  <url><loc>${new URL(ruta, sitio).href}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${direcciones.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
