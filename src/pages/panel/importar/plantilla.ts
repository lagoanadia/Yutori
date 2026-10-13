export const prerender = false;
import type { APIRoute } from 'astro';
import { PLANTILLAS, plantillaCsv } from '../../../lib/plantillas';

// /panel/importar/plantilla?tipo=talleristas → descarga un CSV con las cabeceras y un ejemplo.
export const GET: APIRoute = ({ url }) => {
  const tipo = url.searchParams.get('tipo') ?? '';
  if (!(tipo in PLANTILLAS)) return new Response('No existe esa plantilla', { status: 404 });
  return new Response(plantillaCsv(tipo as keyof typeof PLANTILLAS), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="plantilla-${tipo}.csv"`,
    },
  });
};
