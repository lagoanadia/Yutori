---
# Copiado de kit-agents (astro-cloudflare 1.0.0). No se edita aquí: se cambia en el kit y se vuelve a copiar.
name: emails-transaccionales
description: Envía emails automáticos (confirmaciones, avisos, recordatorios) desde Astro en Cloudflare Workers con Resend, sin bloquear ni romper la petición. Úsala al añadir un aviso por email nuevo o al cambiar uno existente.
---

# Emails transaccionales (Cloudflare Workers + Resend)

## Arquitectura en dos capas

1. **Módulo de envío** (por ejemplo, `src/lib/email.ts`): sabe *cómo* se envía. Plantilla HTML, versión en texto,
   llamada a la API y gestión de errores. Se escribe una vez.
2. **Módulo de avisos** (por ejemplo, `src/lib/avisos.ts`): sabe *qué* se envía y *a quién*. Una función por
   evento de negocio: `avisoReservaHecha(codigo)`, `avisoPagoConfirmado(codigo)`…

Las páginas solo llaman a funciones del módulo de avisos. Nunca construyen emails ellas mismas.

## Reglas del envío

- **No bloquear**: el envío va en segundo plano con `waitUntil` (de `cloudflare:workers`).
  La persona no espera a que salga el email.
- **Nunca romper el flujo principal**: un fallo de email se registra con `console.error` y ya está.
  Una reserva no puede fallar porque el proveedor de email esté caído.
- **Sin clave, sin envío**: si falta `RESEND_API_KEY` o el remitente, no se envía nada. En desarrollo se escribe el
  email en la consola para poder revisarlo.
- **Secretos**: la clave va como Secret de Cloudflare (`wrangler secret put RESEND_API_KEY`), nunca en el código
  ni en `wrangler.jsonc`.
- **HTML + texto**: envía siempre las dos versiones (mejor entrega y accesibilidad).
- **Escapa** todo dato que venga del usuario antes de meterlo en el HTML (nombre, mensaje…).
- **Responder a**: pon `reply_to` con el email del negocio, para que las respuestas lleguen a una persona.

## Reglas del contenido

- Un aviso para el cliente y, si hace falta, otro para la administración con un botón al registro en el panel.
- Asunto que se entienda sin abrir el email: «Tu reserva para el taller de velas · Yutori».
- La voz y el tono los marca el `CLAUDE.md` del proyecto.
- Los enlaces se construyen con la URL pública configurada (por ejemplo, `SITIO_URL`), nunca con `localhost`.
- Datos personales: solo los necesarios para ese aviso.

## Ejemplo mínimo de aviso

```ts
export async function avisoReservaHecha(codigo: string) {
  const r = await uno<{ nombre: string; email: string; titulo: string }>(
    'SELECT nombre, email, titulo FROM reservas WHERE codigo = ?1', codigo);
  if (!r) return;
  enviar({
    para: r.email,
    asunto: `Tu reserva: ${r.titulo}`,
    titulo: `¡Gracias, ${r.nombre.split(' ')[0]}!`,
    parrafos: ['Hemos recibido tu reserva.'],
    boton: { texto: 'Ver mi reserva', url: url(`/reserva/${codigo}`) },
  });
}
```

## Antes de terminar

Prueba el aviso en local y revisa en la consola el texto que se habría enviado.
