---
# Copiado de kit-agents (astro-cloudflare 1.0.0). No se edita aquí: se cambia en el kit y se vuelve a copiar.
name: formulario-publico
description: Crea o revisa un formulario público en Astro con servidor (Cloudflare Workers) con validación en el servidor, antispam, consentimiento de privacidad y patrón POST-redirect-GET. Úsala para cualquier formulario que rellene un visitante (contacto, reserva, solicitud, propuesta).
---

# Formulario público seguro (Astro + Cloudflare)

El formulario y su procesamiento viven en **la misma página `.astro`**: el frontmatter atiende el `POST`
y el HTML pinta el formulario, los errores o el mensaje de gracias.

## Lista de comprobación

1. **La página va con servidor**: `export const prerender = false;`
2. **Lectura acotada de campos**: cada campo con `trim()` y longitud máxima.
   ```ts
   const datos = await Astro.request.formData();
   const campo = (k: string, max = 160) => String(datos.get(k) ?? '').trim().slice(0, max);
   ```
3. **Campo trampa (honeypot)**: un campo invisible para personas que los bots rellenan. Si llega con contenido,
   se responde como si todo fuera bien, pero no se guarda nada.
   ```astro
   <div class="trampa" aria-hidden="true">
     <label for="web">No rellenes este campo</label>
     <input id="web" name="web" tabindex="-1" autocomplete="off" />
   </div>
   ```
   ```ts
   if (campo('web')) return Astro.redirect('/pagina?enviado', 303);
   ```
4. **Validación en el servidor** con mensajes en lenguaje humano, acumulados en un array `errores`.
   Valores de listas (`select`, `radio`) comprobados contra los permitidos; nunca se confía en el navegador.
5. **Consentimiento de privacidad** obligatorio y guardado **con fecha**
   (`acepta_privacidad_en = strftime('%Y-%m-%dT%H:%M:%S', 'now')`). Lo pide el RGPD para poder demostrarlo.
6. **Captcha (Turnstile)** verificado en el servidor **solo si no hay otros errores** (así no se gasta en envíos inválidos).
   Si el proyecto no tiene claves configuradas, la trampa del punto 3 sigue protegiendo.
7. **SQL parametrizado** al guardar: `.prepare('... VALUES (?1, ?2)').bind(a, b)`. Nunca interpolar.
8. **Avisos por email** después de guardar y sin bloquear la respuesta (ver la skill `emails-transaccionales`).
9. **POST-redirect-GET**: tras guardar, `return Astro.redirect('/pagina?enviado', 303);`
   Así, si la persona recarga, el formulario no se envía dos veces. La página muestra «gracias» si ve `?enviado`.
10. **Si hay errores**: se vuelve a pintar el formulario **con lo que escribió** la persona (no se le hace repetir nada)
    y con los errores en `<div class="errores" role="alert">`.

## Accesibilidad del HTML

- Cada campo con `<label for>` y su `id`. Los grupos de radio o casillas, en `<fieldset>` + `<legend>`.
- `type`, `autocomplete` (`name`, `email`, `tel`) y `maxlength` iguales a los del servidor, más `required`.
- Botón de envío con texto que describe la acción («Pedir mi bono», no «Enviar»).

## Errores típicos que hay que evitar

- Validar solo con `required` en el HTML: se salta con cualquier herramienta.
- Mostrar en una página datos que ha escrito el usuario con `set:html`: provoca XSS.
- Redirigir con 302 tras un POST: usa 303.
- Guardar la casilla de privacidad como sí/no en vez de como fecha.
