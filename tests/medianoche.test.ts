import { describe, expect, it } from 'vitest';
import { caducidadRenovacion, medianocheMadridAUtc } from '../src/lib/clases';

describe('medianocheMadridAUtc', () => {
  it('invierno (UTC+1): las 00:00 de Madrid son las 23:00 del día anterior en UTC', () => {
    expect(medianocheMadridAUtc('2027-01-06')).toBe('2027-01-05T23:00:00');
  });
  it('verano (UTC+2): las 00:00 de Madrid son las 22:00 del día anterior en UTC', () => {
    expect(medianocheMadridAUtc('2027-07-06')).toBe('2027-07-05T22:00:00');
  });
  it('días de cambio de hora: el domingo 28-03-2027 empieza en UTC+1 y el 31-10-2027 en UTC+2', () => {
    expect(medianocheMadridAUtc('2027-03-28')).toBe('2027-03-27T23:00:00');
    expect(medianocheMadridAUtc('2027-03-29')).toBe('2027-03-28T22:00:00');
    expect(medianocheMadridAUtc('2027-10-31')).toBe('2027-10-30T22:00:00');
    expect(medianocheMadridAUtc('2027-11-01')).toBe('2027-10-31T23:00:00');
  });
  it('cambio de año', () => {
    expect(medianocheMadridAUtc('2027-01-01')).toBe('2026-12-31T23:00:00');
  });
});

describe('caducidadRenovacion', () => {
  it('es el inicio del día 6 del mes destino en Madrid', () => {
    expect(caducidadRenovacion('2026-11')).toBe('2026-11-05T23:00:00');
    expect(caducidadRenovacion('2027-04')).toBe('2027-04-05T22:00:00');
    expect(caducidadRenovacion('2027-01')).toBe('2027-01-05T23:00:00');
  });
});
