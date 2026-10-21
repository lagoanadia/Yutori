import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from './apoyo/cloudflare-workers';
import { reservarTaller } from '../src/lib/reservas';
import { mesesVisibles } from '../src/lib/talleres';

const cliente = { nombre: 'Ana', telefono: '600000000', email: 'ana@ejemplo.es', plazas: 1 };

/** Crea un taller publicado en la fecha dada y devuelve su id. */
function crearTaller(fecha: string, plazas = 2) {
  env.DB.exec(`DELETE FROM reservas; DELETE FROM talleres;`);
  env.DB.exec(`INSERT INTO talleres (titulo, slug, fecha, franja, hora_inicio, hora_fin, precio_cent, plazas, estado)
               VALUES ('Prueba', 'prueba', '${fecha}', 'sabado_manana', '10:00', '12:00', 3000, ${plazas}, 'publicado')`);
  return (env.DB.base.prepare('SELECT id FROM talleres').get() as { id: number }).id;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z')); // 12:00 en España
});
afterEach(() => vi.useRealTimers());

describe('reservar un taller: hasta el día antes', () => {
  it('no deja reservar un taller de hoy', async () => {
    expect(await reservarTaller(crearTaller('2026-10-17'), cliente)).toBeNull();
  });
  it('no deja reservar un taller de ayer', async () => {
    expect(await reservarTaller(crearTaller('2026-10-16'), cliente)).toBeNull();
  });
  it('deja reservar un taller de mañana', async () => {
    expect(await reservarTaller(crearTaller('2026-10-18'), cliente)).toMatch(/\S/);
  });
  it('usa la fecha de España: a las 23:30 UTC del 17 ya es 18 y el taller del 18 es de hoy', async () => {
    vi.setSystemTime(new Date('2026-10-17T23:30:00Z'));
    expect(await reservarTaller(crearTaller('2026-10-18'), cliente)).toBeNull();
  });
  it('la regla de las plazas sigue igual', async () => {
    const id = crearTaller('2026-10-20', 2);
    expect(await reservarTaller(id, { ...cliente, plazas: 3 })).toBeNull();
    expect(await reservarTaller(id, { ...cliente, plazas: 2 })).not.toBeNull();
    expect(await reservarTaller(id, cliente)).toBeNull();
  });
});

describe('mesesVisibles', () => {
  const t = (fecha: string) => ({ fecha });
  const claves = (m: Map<string, unknown[]>) => [...m.keys()];

  it('enseña el mes actual y el siguiente si tiene talleres, nunca el posterior', () => {
    const m = mesesVisibles([t('2026-10-24'), t('2026-11-07'), t('2026-12-05')], '2026-10-17');
    expect(claves(m)).toEqual(['2026-10', '2026-11']);
  });
  it('sin talleres del mes siguiente, solo el actual', () => {
    expect(claves(mesesVisibles([t('2026-10-24'), t('2026-12-05')], '2026-10-17'))).toEqual(['2026-10']);
  });
  it('si solo hay talleres del mes siguiente, enseña solo ese', () => {
    expect(claves(mesesVisibles([t('2026-11-07')], '2026-10-17'))).toEqual(['2026-11']);
  });
  it('en diciembre el siguiente es enero del año que viene', () => {
    const m = mesesVisibles([t('2026-12-12'), t('2027-01-09'), t('2027-02-06')], '2026-12-17');
    expect(claves(m)).toEqual(['2026-12', '2027-01']);
  });
  it('sin talleres, vacío', () => {
    expect(mesesVisibles([], '2026-10-17').size).toBe(0);
  });
});
