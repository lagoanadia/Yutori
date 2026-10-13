// Fotos en Cloudflare R2.
// Carpetas: "propuestas/" (solo las ve Iris en el panel) y "talleres/" (públicas en la web).
import { env } from 'cloudflare:workers';
import { codigoAleatorio } from './util';

export const MAX_MB = 5;
const EXTENSIONES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const archivosDe = (valores: FormDataEntryValue[]) =>
  valores.filter((v): v is File => v instanceof File && v.size > 0);

/** Comprueba los primeros bytes: el tipo que dice el navegador se puede falsear. */
function tipoReal(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const texto = String.fromCharCode(...bytes.slice(0, 12));
  if (texto.startsWith('RIFF') && texto.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Devuelve un mensaje de error o null si la foto es válida. */
export function errorDeFoto(foto: File) {
  if (!(foto.type in EXTENSIONES)) return `"${foto.name}" no es una foto válida: usa JPG, PNG o WebP.`;
  if (foto.size > MAX_MB * 1024 * 1024) return `"${foto.name}" pesa más de ${MAX_MB} MB.`;
  return null;
}

export async function guardarFoto(foto: File, carpeta: 'propuestas' | 'talleres') {
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const tipo = tipoReal(bytes);
  if (!tipo) throw new Error(`"${foto.name}" no es una imagen válida.`);
  const clave = `${carpeta}/${codigoAleatorio(12)}.${EXTENSIONES[tipo]}`;
  await env.FOTOS.put(clave, bytes, { httpMetadata: { contentType: tipo } });
  return clave;
}

export async function borrarFoto(clave: string | null) {
  if (clave) await env.FOTOS.delete(clave);
}

export async function respuestaFoto(clave: string) {
  if (!/^(propuestas|talleres)\/[\w-]+\.(jpg|png|webp)$/.test(clave)) return new Response('No encontrada', { status: 404 });
  const objeto = await env.FOTOS.get(clave);
  if (!objeto) return new Response('No encontrada', { status: 404 });
  return new Response(objeto.body, {
    headers: {
      'Content-Type': objeto.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': clave.startsWith('talleres/') ? 'public, max-age=31536000, immutable' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** URL para mostrar una foto: las de talleres son públicas, las de propuestas solo desde el panel. */
export const urlFoto = (clave: string) => (clave.startsWith('talleres/') ? `/fotos/${clave}` : `/panel/foto/${clave}`);
