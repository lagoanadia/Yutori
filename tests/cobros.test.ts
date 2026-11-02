import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cambiarMetodoPago, importeMensual, marcarNoRenueva, mesInscripcion, renovarMes, reservarMensual, reservarSuelta } from '../src/lib/clases';
import { cobrarRenovaciones, confirmarPago, reintentarCobro } from '../src/lib/pagos';
import { plazoPago } from '../src/lib/reservas';
import { aFormulario, firmaValida } from '../src/lib/stripe';
import { env } from './apoyo/cloudflare-workers';
import { alumna, crearGrupo, insertarReserva } from './apoyo/datos';

const fila = (sql: string, ...p: (string | number)[]) => env.DB.base.prepare(sql).get(...p) as Record<string, unknown>;
const filas = (sql: string, ...p: (string | number)[]) => env.DB.base.prepare(sql).all(...p) as Record<string, unknown>[];
const fijarReloj = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

/** Simula la API de Stripe: cada llamada se apunta y responde lo que diga `responder`. */
function simularStripe(responder: (ruta: string, cuerpo: string, cabeceras: Record<string, string>) => unknown) {
  const llamadas: { ruta: string; cuerpo: string; cabeceras: Record<string, string> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const ruta = url.replace('https://api.stripe.com/v1/', '');
    const cabeceras = init.headers as Record<string, string>;
    const cuerpo = String(init.body ?? '');
    llamadas.push({ ruta, cuerpo, cabeceras });
    const datos = responder(ruta, cuerpo, cabeceras) as { error?: unknown };
    return new Response(JSON.stringify(datos), { status: datos?.error ? 402 : 200 });
  }));
  return llamadas;
}

beforeEach(() => { env.STRIPE_SECRET_KEY = 'sk_test_prueba'; });
afterEach(() => {
  delete env.STRIPE_SECRET_KEY;
  vi.useRealTimers();
});

describe('calendario de las mensuales (baja hasta el 25, renovación el 26)', () => {
  it('del 1 al 25 no hay plaza mensual nueva (solo sueltas)', () => {
    fijarReloj('2027-03-25T21:00:00Z'); // 22:00 del 25 en Madrid
    expect(mesInscripcion()).toBeNull();
  });
  it('desde el 26 se abre el mes siguiente', () => {
    fijarReloj('2027-03-25T23:30:00Z'); // 00:30 del 26 en Madrid
    expect(mesInscripcion()).toBe('2027-04');
  });
  it('en diciembre, el mes siguiente es enero del año que viene', () => {
    fijarReloj('2027-12-28T10:00:00Z');
    expect(mesInscripcion()).toBe('2028-01');
  });
});

describe('renovarMes con bajas y formas de pago', () => {
  it('no renueva a quien ha avisado de que no sigue', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n: 1 });
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n: 2 });
    const baja = fila(`SELECT id FROM reservas WHERE nombre = 'Alumna 2'`).id as number;
    expect(await marcarNoRenueva(baja, true)).toBe(true);
    expect(await renovarMes('2027-03', '2027-04')).toMatchObject({ renovadas: 1, sinPlaza: 0 });
    expect(filas(`SELECT nombre FROM reservas WHERE mes = '2027-04'`)).toEqual([{ nombre: 'Alumna 1' }]);
  });

  it('con tarjeta guardada se renueva con tarjeta (y la conserva); si eligió efectivo, sigue en efectivo', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n: 1 });
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n: 2 });
    env.DB.exec(`UPDATE reservas SET stripe_cliente = 'cus_1', stripe_metodo = 'pm_1', tarjeta = 'visa ···· 4242', metodo_pago = 'tarjeta' WHERE nombre = 'Alumna 1';
                 UPDATE reservas SET stripe_cliente = 'cus_2', stripe_metodo = 'pm_2', metodo_pago = 'efectivo' WHERE nombre = 'Alumna 2'`);
    await renovarMes('2027-03', '2027-04');
    expect(filas(`SELECT nombre, metodo_pago, stripe_cliente, stripe_metodo, tarjeta FROM reservas WHERE mes = '2027-04' ORDER BY nombre`)).toEqual([
      { nombre: 'Alumna 1', metodo_pago: 'tarjeta', stripe_cliente: 'cus_1', stripe_metodo: 'pm_1', tarjeta: 'visa ···· 4242' },
      { nombre: 'Alumna 2', metodo_pago: 'efectivo', stripe_cliente: 'cus_2', stripe_metodo: 'pm_2', tarjeta: null },
    ]);
  });

  it('cambiarMetodoPago: a tarjeta solo con una tarjeta guardada, y solo antes del cobro', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n: 1 });
    await renovarMes('2027-03', '2027-04');
    const id = fila(`SELECT id FROM reservas WHERE mes = '2027-04'`).id as number;
    expect(await cambiarMetodoPago(id, 'tarjeta')).toBe(false);
    env.DB.exec(`UPDATE reservas SET stripe_metodo = 'pm_1' WHERE id = ${id}`);
    expect(await cambiarMetodoPago(id, 'tarjeta')).toBe(true);
    env.DB.exec(`UPDATE reservas SET cobro_intentado_en = '2027-04-01T07:00:00' WHERE id = ${id}`);
    expect(await cambiarMetodoPago(id, 'efectivo')).toBe(false);
  });
});

describe('importe y primera vez', () => {
  it('con dos precios, «Con máquina» paga el alto y «Sin máquina» el bajo', () => {
    const g = { precio_mes_cent: 5000, precio_mes_max_cent: 6000 };
    expect(importeMensual(g, 'Con máquina')).toBe(6000);
    expect(importeMensual(g, 'Sin máquina')).toBe(5000);
    expect(importeMensual({ precio_mes_cent: 5500, precio_mes_max_cent: null }, 'Con máquina')).toBe(5500);
  });

  it('la reserva guarda el importe y marca la primera vez en esa clase', async () => {
    const g = crearGrupo(8);
    env.DB.exec(`UPDATE grupos SET precio_mes_cent = 5000, precio_mes_max_cent = 6000; UPDATE clases SET precio_suelta_cent = 2000`);
    await reservarMensual(g, '2027-03', { ...alumna(1), modalidad: 'Con máquina' });
    expect(fila(`SELECT importe_cent, primera_vez FROM reservas WHERE nombre = 'Alumna 1'`)).toEqual({ importe_cent: 6000, primera_vez: 1 });
    // Ya vino (confirmada) a esta clase: una suelta después no es su primera vez.
    env.DB.exec(`UPDATE reservas SET estado = 'confirmada'`);
    await reservarSuelta(g, '2027-03-13', alumna(1));
    expect(fila(`SELECT importe_cent, primera_vez FROM reservas WHERE tipo = 'clase_suelta'`)).toEqual({ importe_cent: 2000, primera_vez: 0 });
  });

  it('con tarjeta la plaza se guarda unos minutos; sin Stripe, 24 horas', () => {
    expect(plazoPago()).toBe('+32 minutes');
    delete env.STRIPE_SECRET_KEY;
    expect(plazoPago()).toBe('+24 hours');
  });
});

describe('cobro automático del día 1', () => {
  /** Una plaza de marzo renovada desde febrero, con tarjeta guardada. */
  function renovadaConTarjeta(n: number, extra = '') {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-02', n });
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n, estado: 'pendiente' });
    env.DB.exec(`UPDATE reservas SET renovada_de = (SELECT id FROM reservas WHERE mes = '2027-02'), metodo_pago = 'tarjeta',
                 stripe_cliente = 'cus_1', stripe_metodo = 'pm_1', importe_cent = 5500 ${extra} WHERE mes = '2027-03'`);
    return fila(`SELECT id FROM reservas WHERE mes = '2027-03'`).id as number;
  }

  it('cobra la plaza renovada, la confirma y no la vuelve a cobrar', async () => {
    fijarReloj('2027-03-01T07:00:00Z');
    const id = renovadaConTarjeta(1);
    const llamadas = simularStripe(() => ({ id: 'pi_1', status: 'succeeded' }));
    expect(await cobrarRenovaciones()).toEqual({ cobradas: 1, fallidas: 0 });
    expect(fila(`SELECT estado, stripe_pago FROM reservas WHERE id = ?`, id)).toEqual({ estado: 'confirmada', stripe_pago: 'pi_1' });
    expect(llamadas[0].ruta).toBe('payment_intents');
    expect(llamadas[0].cuerpo).toContain('amount=5500');
    expect(llamadas[0].cuerpo).toContain('off_session=true');
    expect(llamadas[0].cabeceras['Idempotency-Key']).toMatch(new RegExp(`^renovacion-${id}-`));
    expect(await cobrarRenovaciones()).toEqual({ cobradas: 0, fallidas: 0 });
    expect(llamadas).toHaveLength(1);
  });

  it('no cobra las plazas del mes siguiente (renovadas el 26) hasta que empieza su mes', async () => {
    fijarReloj('2027-02-27T10:00:00Z');
    renovadaConTarjeta(1);
    const llamadas = simularStripe(() => ({ id: 'pi_1', status: 'succeeded' }));
    expect(await cobrarRenovaciones()).toEqual({ cobradas: 0, fallidas: 0 });
    expect(llamadas).toHaveLength(0);
  });

  it('no cobra las de efectivo', async () => {
    fijarReloj('2027-03-01T07:00:00Z');
    renovadaConTarjeta(1, ", metodo_pago = 'efectivo'");
    const llamadas = simularStripe(() => ({ id: 'pi_1', status: 'succeeded' }));
    expect(await cobrarRenovaciones()).toEqual({ cobradas: 0, fallidas: 0 });
    expect(llamadas).toHaveLength(0);
  });

  it('si el banco lo rechaza, la plaza se guarda pendiente con el motivo, y reintentar usa otra clave', async () => {
    fijarReloj('2027-03-01T07:00:00Z');
    const id = renovadaConTarjeta(1);
    let llamadas = simularStripe(() => ({ error: { message: 'Your card was declined.', decline_code: 'insufficient_funds' } }));
    expect(await cobrarRenovaciones()).toEqual({ cobradas: 0, fallidas: 1 });
    expect(fila(`SELECT estado, caduca_en, cobro_error FROM reservas WHERE id = ?`, id))
      .toEqual({ estado: 'pendiente', caduca_en: null, cobro_error: 'Your card was declined.' });
    const primeraClave = llamadas[0].cabeceras['Idempotency-Key'];

    vi.setSystemTime(new Date('2027-03-02T09:00:00Z'));
    llamadas = simularStripe(() => ({ id: 'pi_2', status: 'succeeded' }));
    expect(await reintentarCobro(id)).toEqual({ cobradas: 1, fallidas: 0 });
    expect(llamadas[0].cabeceras['Idempotency-Key']).not.toBe(primeraClave);
    expect(fila(`SELECT estado, cobro_error FROM reservas WHERE id = ?`, id)).toEqual({ estado: 'confirmada', cobro_error: null });
  });

  it('sin Stripe no hace nada', async () => {
    delete env.STRIPE_SECRET_KEY;
    expect(await cobrarRenovaciones()).toEqual({ cobradas: 0, fallidas: 0 });
  });
});

describe('confirmarPago (vuelta de la página de pago o aviso de Stripe)', () => {
  const sesion = (codigo: string, pagada = true) => ({
    id: 'cs_1', payment_status: pagada ? 'paid' : 'unpaid', customer: 'cus_9', metadata: { codigo },
    payment_intent: { id: 'pi_9', payment_method: { id: 'pm_9', card: { brand: 'visa', last4: '4242' } } },
  });
  const codigoDe = (n: number) => fila(`SELECT codigo FROM reservas WHERE nombre = ?`, `Alumna ${n}`).codigo as string;

  it('confirma la mensual pendiente y guarda la tarjeta para las renovaciones; repetirlo no hace nada', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_mensual', mes: '2027-03', n: 1, estado: 'pendiente' });
    const llamadas = simularStripe(() => sesion(codigoDe(1)));
    expect(await confirmarPago('cs_1')).toBe(true);
    expect(fila(`SELECT estado, metodo_pago, stripe_cliente, stripe_metodo, tarjeta, stripe_pago FROM reservas`)).toEqual({
      estado: 'confirmada', metodo_pago: 'tarjeta', stripe_cliente: 'cus_9', stripe_metodo: 'pm_9', tarjeta: 'visa ···· 4242', stripe_pago: 'pi_9',
    });
    expect(await confirmarPago('cs_1')).toBe(true);
    expect(llamadas.filter((l) => l.ruta.startsWith('refunds'))).toHaveLength(0);
  });

  it('una clase suelta no guarda la tarjeta (no hay nada que renovar)', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: '2027-03-13', n: 1, estado: 'pendiente' });
    simularStripe(() => sesion(codigoDe(1)));
    await confirmarPago('cs_1');
    expect(fila(`SELECT estado, stripe_metodo FROM reservas`)).toEqual({ estado: 'confirmada', stripe_metodo: null });
  });

  it('si la plaza ya se había liberado, devuelve el dinero', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: '2027-03-13', n: 1, estado: 'liberada' });
    const llamadas = simularStripe(() => sesion(codigoDe(1)));
    expect(await confirmarPago('cs_1')).toBe(false);
    const devolucion = llamadas.find((l) => l.ruta === 'refunds');
    expect(devolucion?.cuerpo).toContain('payment_intent=pi_9');
    expect(devolucion?.cabeceras['Idempotency-Key']).toBe('devolucion-pi_9');
    expect(fila(`SELECT estado FROM reservas`)).toEqual({ estado: 'liberada' });
  });

  it('un pago sin cobrar no confirma nada', async () => {
    const g = crearGrupo(8);
    insertarReserva({ grupo: g, tipo: 'clase_suelta', fecha: '2027-03-13', n: 1, estado: 'pendiente' });
    simularStripe(() => sesion(codigoDe(1), false));
    expect(await confirmarPago('cs_1')).toBe(false);
    expect(fila(`SELECT estado FROM reservas`)).toEqual({ estado: 'pendiente' });
  });
});

describe('utilidades de Stripe', () => {
  it('aFormulario anida objetos y listas como espera Stripe', () => {
    expect(aFormulario({ a: 1, b: { c: 'x y' }, d: [{ e: 2 }], f: ['g'], h: null }).join('&'))
      .toBe('a=1&b%5Bc%5D=x%20y&d%5B0%5D%5Be%5D=2&f%5B0%5D=g');
  });

  it('firmaValida acepta la firma correcta y rechaza una falsa o un aviso viejo', async () => {
    const secreto = 'whsec_prueba';
    const cuerpo = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const firma = [...new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${t}.${cuerpo}`)))]
      .map((x) => x.toString(16).padStart(2, '0')).join('');
    const ahora = t * 1000 + 60_000;
    expect(await firmaValida(cuerpo, `t=${t},v1=${firma}`, secreto, ahora)).toBe(true);
    expect(await firmaValida(cuerpo, `t=${t},v1=${'0'.repeat(64)}`, secreto, ahora)).toBe(false);
    expect(await firmaValida('{"id":"evt_2"}', `t=${t},v1=${firma}`, secreto, ahora)).toBe(false);
    expect(await firmaValida(cuerpo, `t=${t},v1=${firma}`, secreto, t * 1000 + 10 * 60_000)).toBe(false);
    expect(await firmaValida(cuerpo, null, secreto, ahora)).toBe(false);
  });
});
