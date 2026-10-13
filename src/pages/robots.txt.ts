// robots.txt: mientras la web sea un prototipo (negocio.indexar = false), los buscadores no entran.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { negocio } from '../data/yutori';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const sitio = env.SITIO_URL || url.origin;
  const texto = negocio.indexar
    ? ['User-agent: *', 'Disallow: /panel/', 'Disallow: /t/', 'Disallow: /reserva/', '', `Sitemap: ${new URL('/sitemap.xml', sitio).href}`]
    : ['User-agent: *', 'Disallow: /'];
  return new Response(`${texto.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
