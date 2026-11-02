// Punto de entrada del Worker: las páginas las sirve Astro y, cada mañana (cron de wrangler.jsonc), se hacen las tareas
// de calendario de las clases: liberar plazas sin pagar, renovar las mensuales desde el día 26 y cobrarlas desde el día 1.
// Las tres son idempotentes: si la web ya lo hizo al visitarla, no se repite nada.
import { handle } from '@astrojs/cloudflare/handler';
import { asegurarRenovacion } from './lib/clases';
import { cobrarRenovaciones } from './lib/pagos';
import { liberarCaducadas } from './lib/reservas';

export default {
  fetch: handle,
  async scheduled(_evento, _env, ctx) {
    ctx.waitUntil((async () => {
      await liberarCaducadas();
      await asegurarRenovacion();
      await cobrarRenovaciones();
    })());
  },
} satisfies ExportedHandler<Env>;
