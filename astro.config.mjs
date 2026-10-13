// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Páginas públicas: HTML estático. Panel y formularios: en el servidor (prerender = false).
  // passthrough: no usamos Cloudflare Images, las fotos se sirven tal cual.
  adapter: cloudflare({ imageService: 'passthrough' }),
});