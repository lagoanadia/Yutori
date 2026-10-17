import { beforeEach, vi } from 'vitest';
import { reiniciarBase } from './cloudflare-workers';

// Base limpia en cada test; los emails sin claves no envían nada, y el fetch falla si alguien lo intenta.
beforeEach(() => {
  reiniciarBase();
  vi.stubGlobal('fetch', () => { throw new Error('Los tests no deben hacer peticiones de red'); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
