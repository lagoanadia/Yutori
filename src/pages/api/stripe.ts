// Avisos de Stripe (webhook): confirma la reserva cuando se completa un pago, aunque la persona cierre la página antes de volver.
// En Stripe: Developers → Webhooks → endpoint https://<web>/api/stripe con el evento checkout.session.completed.
// Su «Signing secret» va como secreto de Cloudflare: STRIPE_WEBHOOK_SECRET.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { firmaValida } from '../../lib/stripe';
import { confirmarPago } from '../../lib/pagos';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cuerpo = await request.text();
  if (!(await firmaValida(cuerpo, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET ?? ''))) {
    return new Response('Firma no válida', { status: 400 });
  }
  const evento = JSON.parse(cuerpo) as { type: string; data: { object: { id: string } } };
  if (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') {
    // Se vuelve a leer la sesión en Stripe: no se fía del contenido del aviso más allá del id.
    await confirmarPago(evento.data.object.id);
  }
  return new Response('ok');
};
