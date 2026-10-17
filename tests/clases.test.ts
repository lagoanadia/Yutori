import { describe, expect, it } from 'vitest';
import { ocupacionMes, renovarMes, reservarMensual, reservarSuelta } from '../src/lib/clases';
import { alumna, crearGrupo, crearGrupoExtra, insertarReserva, mensualesDe } from './apoyo/datos';

const MES = '2027-03';
const DIA1 = '2027-03-06';
const DIA2 = '2027-03-13';

function llenar(grupo: number, mensuales: number) {
  for (let i = 1; i <= mensuales; i++) insertarReserva({ grupo, tipo: 'clase_mensual', mes: MES, n: i });
}

describe('reservarMensual y el pico de clases sueltas', () => {
  it('rechaza la mensual si una sesión del mes ya tiene sueltas que completan el grupo (7 mensuales + 1 suelta en 8 plazas)', async () => {
    const g = crearGrupo(8);
    llenar(g, 7);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 50 });
    expect(await reservarMensual(g, MES, alumna(99))).toBeNull();
    expect(mensualesDe(g, MES)).toBe(7);
  });

  it('acepta la mensual cuando no hay sueltas (7 mensuales en 8 plazas)', async () => {
    const g = crearGrupo(8);
    llenar(g, 7);
    expect(await reservarMensual(g, MES, alumna(99))).toMatch(/^[0-9a-f]{24}$/);
    expect(mensualesDe(g, MES)).toBe(8);
  });

  it('no deja pasar de las plazas: con el grupo lleno de mensuales rechaza otra', async () => {
    const g = crearGrupo(8);
    llenar(g, 8);
    expect(await reservarMensual(g, MES, alumna(99))).toBeNull();
  });

  it('las sueltas de otro mes no cuentan para la mensual de este mes', async () => {
    const g = crearGrupo(8);
    llenar(g, 7);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: '2027-04-03', n: 50 });
    expect(await reservarMensual(g, MES, alumna(99))).not.toBeNull();
  });
});

describe('PICO_SUELTAS (vía ocupacionMes)', () => {
  it('usa el día con MÁS sueltas, no la suma: 2 sueltas en días distintos cuentan 1', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 1 });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA2, n: 2 });
    expect((await ocupacionMes(MES)).get(g)).toBe(1);
  });

  it('2 sueltas el mismo día cuentan 2', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 1 });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 2 });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA2, n: 3 });
    expect((await ocupacionMes(MES)).get(g)).toBe(2);
  });

  it('las sueltas liberadas o canceladas no cuentan', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 1, estado: 'liberada' });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 2, estado: 'cancelada' });
    expect((await ocupacionMes(MES)).get(g)).toBe(0);
  });

  it('las sueltas pendientes sí cuentan', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 1, estado: 'pendiente' });
    expect((await ocupacionMes(MES)).get(g)).toBe(1);
  });

  it('las mensuales liberadas o canceladas no cuentan', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: MES, n: 1, estado: 'liberada' });
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: MES, n: 2, estado: 'cancelada' });
    expect((await ocupacionMes(MES)).get(g)).toBe(0);
  });
});

describe('ocupacionMes', () => {
  it('devuelve mensuales + pico por grupo, y 0 para grupos sin nada', async () => {
    const g1 = crearGrupo(8);
    const g2 = crearGrupoExtra(8, 1, 'otra');
    llenar(g1, 3);
    insertarReserva({ grupo: g1, tipo: 'clase_suelta', fecha: DIA1, n: 20 });
    insertarReserva({ grupo: g1, tipo: 'clase_suelta', fecha: DIA1, n: 21 });
    const o = await ocupacionMes(MES);
    expect(o.get(g1)).toBe(5);
    expect(o.get(g2)).toBe(0);
  });
});

describe('renovarMes', () => {
  const ORIGEN = '2027-02';
  const DESTINO = '2027-03';
  const origen = (grupo: number, n: number, estado = 'confirmada') =>
    insertarReserva({ grupo, tipo: 'clase_mensual', mes: ORIGEN, n, estado });

  it('con cupo de 3 y 4 confirmadas en el origen renueva las 3 más antiguas y cuenta 1 sin plaza', async () => {
    const g = crearGrupo(8);
    llenar(g, 5); // 5 mensuales en el destino -> cupo 3
    // ids de alumna distintos de los del destino; la 4 es la más reciente
    for (const [n, creado] of [[11, '2026-12-01T10:00:00'], [12, '2026-12-02T10:00:00'], [13, '2026-12-03T10:00:00'], [14, '2026-12-04T10:00:00']] as const) {
      insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: ORIGEN, n, creado });
    }
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 3, sinPlaza: 1 });
    expect(mensualesDe(g, DESTINO)).toBe(8);
    const emails = (await import('./apoyo/cloudflare-workers')).env.DB.base
      .prepare(`SELECT email FROM reservas WHERE mes = ?1 AND estado = 'pendiente' ORDER BY email`).all(DESTINO) as { email: string }[];
    expect(emails.map((e) => e.email)).toEqual(['alumna11@ejemplo.es', 'alumna12@ejemplo.es', 'alumna13@ejemplo.es']);
  });

  it('respeta el pico de sueltas del destino al calcular el cupo', async () => {
    const g = crearGrupo(4);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 60 });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 61 });
    for (let n = 1; n <= 3; n++) origen(g, n);
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 2, sinPlaza: 1 });
  });

  it('respeta las mensuales ya apuntadas en el destino (otras alumnas)', async () => {
    const g = crearGrupo(4);
    llenar(g, 3);
    for (let n = 11; n <= 13; n++) origen(g, n);
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 1, sinPlaza: 2 });
  });

  it('no renueva en horarios desactivados (activo = 0) y tampoco los cuenta como sin plaza', async () => {
    const g = crearGrupo(8, 0);
    origen(g, 1);
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 0, sinPlaza: 0 });
    expect(mensualesDe(g, DESTINO)).toBe(0);
  });

  it('no renueva las que no están confirmadas (pendientes, liberadas, canceladas)', async () => {
    const g = crearGrupo(8);
    origen(g, 1, 'pendiente');
    origen(g, 2, 'liberada');
    origen(g, 3, 'cancelada');
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 0, sinPlaza: 0 });
  });

  it('no duplica a quien ya está apuntada en el destino, y una segunda llamada renueva 0', async () => {
    const g = crearGrupo(8);
    origen(g, 1);
    origen(g, 2);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: DESTINO, n: 1, estado: 'pendiente' }); // la 1 ya está
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 1, sinPlaza: 0 });
    expect(mensualesDe(g, DESTINO)).toBe(2);
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 0, sinPlaza: 0 });
    expect(mensualesDe(g, DESTINO)).toBe(2);
  });

  it('las renovadas quedan pendientes de pago y sin caducidad', async () => {
    const g = crearGrupo(8);
    origen(g, 1);
    await renovarMes(ORIGEN, DESTINO);
    const { env } = await import('./apoyo/cloudflare-workers');
    const r = env.DB.base.prepare(`SELECT estado, caduca_en, codigo FROM reservas WHERE mes = ?1`).get(DESTINO) as { estado: string; caduca_en: string | null; codigo: string };
    expect(r.estado).toBe('pendiente');
    expect(r.caduca_en).toBeNull();
    expect(r.codigo).toMatch(/^[0-9a-f]{24}$/);
  });

  it('aplica el cupo grupo a grupo', async () => {
    const g1 = crearGrupo(2);
    const g2 = crearGrupoExtra(5, 1, 'otra');
    for (let n = 1; n <= 3; n++) origen(g1, n);
    for (let n = 4; n <= 6; n++) origen(g2, n);
    expect(await renovarMes(ORIGEN, DESTINO)).toEqual({ renovadas: 5, sinPlaza: 1 });
    expect(mensualesDe(g1, DESTINO)).toBe(2);
    expect(mensualesDe(g2, DESTINO)).toBe(3);
  });
});

describe('reservarSuelta (comportamiento previo)', () => {
  it('resta las mensuales del mes y las sueltas de esa fecha', async () => {
    const g = crearGrupo(8);
    llenar(g, 5);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 50 });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA1, n: 51 });
    // 8 - 5 - 2 = 1 libre en DIA1
    expect(await reservarSuelta(g, DIA1, alumna(98))).not.toBeNull();
    expect(await reservarSuelta(g, DIA1, alumna(99))).toBeNull();
  });

  it('las sueltas de otro día no restan en esta fecha', async () => {
    const g = crearGrupo(8);
    llenar(g, 6);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA2, n: 50 });
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: DIA2, n: 51 });
    expect(await reservarSuelta(g, DIA1, alumna(98))).not.toBeNull(); // 8 - 6 - 0 = 2
    expect(await reservarSuelta(g, DIA1, alumna(99))).not.toBeNull();
    expect(await reservarSuelta(g, DIA1, alumna(97))).toBeNull();
  });
});
