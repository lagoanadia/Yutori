import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canjearBono, codigoBono, confirmarPagoBono, crearBono } from '../src/lib/bonos';
import { confirmarPago } from '../src/lib/pagos';
import { env } from './apoyo/cloudflare-workers';

const bono = (id: number) => env.DB.base.prepare('SELECT * FROM solicitudes WHERE id = ?').get(id) as Record<string, unknown>;
const datos = { nombre: 'Nadia', email: 'n@ejemplo.es', telefono: '600000000', tipo: 'importe' as const, detalle: '50 €', para: 'Ana', importeCent: 5000 };

beforeEach(() => { env.STRIPE_SECRET_KEY = 'sk_test_prueba'; });
afterEach(() => { delete env.STRIPE_SECRET_KEY; vi.useRealTimers(); });

describe('bonos regalo', () => {
  it('el código es fácil de dictar: BONO-XXXX-XXXX sin 0, O, 1, I ni L', () => {
    for (let i = 0; i < 50; i++) expect(codigoBono()).toMatch(/^BONO-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });

  it('con importe y Stripe se paga en la web; sin importe (taller sin elegir) se gestiona a mano', async () => {
    expect(await crearBono(datos)).toMatchObject({ pagaEnLaWeb: true });
    expect(await crearBono({ ...datos, tipo: 'taller', detalle: 'Aún no sabe qué taller', importeCent: null })).toMatchObject({ pagaEnLaWeb: false });
  });

  it('al pagar recibe código, caduca a los 3 meses y repetir la confirmación no cambia nada', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
    const { id } = (await crearBono(datos))!;
    const codigo = await confirmarPagoBono(id, 'pi_1');
    expect(codigo).toMatch(/^BONO-/);
    expect(bono(id)).toMatchObject({ codigo_bono: codigo, caduca_bono: '2027-02-04', stripe_pago: 'pi_1', estado: 'cerrada' });
    expect(await confirmarPagoBono(id, 'pi_2')).toBe(codigo);
    expect(bono(id).stripe_pago).toBe('pi_1');
  });

  it('el aviso de Stripe de un bono lo confirma (no lo trata como una reserva)', async () => {
    const { id } = (await crearBono(datos))!;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'cs_1', payment_status: 'paid', customer: null, metadata: { bono: String(id) }, payment_intent: { id: 'pi_9', payment_method: null },
    }))));
    expect(await confirmarPago('cs_1')).toBe(true);
    expect(bono(id).stripe_pago).toBe('pi_9');
  });

  it('se puede marcar como usado y deshacerlo', async () => {
    const { id } = (await crearBono(datos))!;
    await confirmarPagoBono(id, 'pi_1');
    await canjearBono(id, true);
    expect(bono(id).canjeado_en).not.toBeNull();
    await canjearBono(id, false);
    expect(bono(id).canjeado_en).toBeNull();
  });
});
