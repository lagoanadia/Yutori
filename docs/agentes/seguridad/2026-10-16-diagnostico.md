# Auditoría de seguridad · Yutori (formularios, panel, enlaces privados y cabeceras)

**Fecha:** 2026-10-16
**Agente:** seguridad (solo lectura, no ha modificado ningún archivo)
**Alcance:** formularios públicos (`bonos`, `privados`, `colabora`, `clases/pedir-plaza`, `talleres/[slug]`) y su lógica en `src/lib`; todo el panel (`src/pages/panel/**`, `sesion.ts`, `acceso.ts`, asistente e importación con IA); enlaces privados `/t/[codigo]` y `/reserva/[codigo]`; `middleware.ts`, `public/_headers`, `astro.config.mjs`, `wrangler.jsonc` y las rutas de fotos.

## Resumen

La base es sólida y no hay nada crítico. Cada escenario se ha comprobado siguiendo el código real:

- El SQL va siempre parametrizado. Donde se interpolan nombres de columna, salen de listas fijas.
- No hay ningún `set:html`. Los emails escapan el HTML.
- El panel pasa entero por el middleware. Con Cloudflare Access se verifica el JWT y con contraseña se usa una cookie HMAC.
- El CSRF lo cubre `checkOrigin` junto con la cookie `SameSite=Strict`.
- Los códigos privados son largos y aleatorios.
- Las plazas se reservan en una sola sentencia.
- Las fotos se validan por sus bytes reales.

Lo que conviene arreglar es sobre todo **abuso** y **RGPD**:

1. Cualquiera puede bloquear las plazas de un taller durante 24 h con reservas falsas.
2. Turnstile deja pasar todo, sin avisar, si falta el secreto, y eso deja el login del panel sin freno real.
3. La importación con IA envía a Groq datos que la política de privacidad no menciona.
4. El enlace de la tallerista sigue enseñando los nombres y teléfonos de las alumnas sin caducar nunca.

Recuento: 🔴 0 · 🟡 4 · 🔵 9.

---

## Hallazgos

### 🔴 Crítico / bloqueante

Ninguno.

### 🟡 Conviene arreglar

#### 1. Acaparar plazas de un taller con reservas falsas
- **Dónde:** `src/lib/reservas.ts:10` (`MAX_PLAZAS_RESERVA = 4`), `src/lib/reservas.ts:63-80` (`reservarTaller`), `src/pages/talleres/[slug].astro:38-40`. Lo mismo pasa en `src/lib/clases.ts:247-278` (`reservarMensual`/`reservarSuelta`) desde `src/pages/clases/pedir-plaza.astro:55-58`.
- **Escenario de ataque:** un troll o un competidor abre `/talleres/<slug>`, resuelve Turnstile a mano (o con un servicio que resuelve captchas) y manda 2 reservas de 4 plazas con nombres y emails inventados. Un taller de 8 plazas sale «completo» en un minuto. Las plazas quedan `pendiente` durante `PLAZO_PAGO_HORAS` (24 h) y se puede repetir cada día. En las clases, cada envío ocupa 1 plaza del mes entero.
- **Impacto:** se pierden ventas reales. Además la tallerista recibe avisos de «Nueva reserva» falsos (`avisos.ts:127-134`) y los emails «Tu plaza está apartada» van a direcciones de terceros.
- **Arreglo sugerido:**
  - Limitar las reservas pendientes por email o teléfono en cada taller o grupo dentro de la misma sentencia `INSERT ... SELECT ... WHERE NOT EXISTS (...)`. Así se respeta la regla de «una sola sentencia».
  - Opcionalmente, bajar `MAX_PLAZAS_RESERVA` o acortar el plazo cuando el taller esté cerca de llenarse.
  - Cuando el aviso a Iris o a la tallerista sea para varias plazas de golpe, marcarlo para revisarlo en el panel, donde ya se puede cancelar.
- **Tamaño:** M
- **¿Toca textos?:** sí. Si se rechaza una segunda reserva hace falta un mensaje nuevo: **necesita texto de Iris**. Otra opción sin texto nuevo es reutilizar el mensaje que ya existe («Ya no quedan tantas plazas libres…»), pero sería engañoso, así que no se recomienda.

#### 2. Turnstile deja pasar todo sin avisar si falta el secreto, y el login del panel queda casi sin freno
- **Dónde:** `src/lib/turnstile.ts:140-144` (`if (!turnstileActivo()) return true;`), `src/components/Turnstile.astro:6`, `src/pages/panel/entrar.astro:18-23`.
- **Escenario de ataque:** si el secreto `TURNSTILE_SECRET` no está puesto en producción (se borra, o no se copia a un entorno nuevo), `turnstileActivo()` devuelve `false`. Entonces el widget no aparece y `verificarTurnstile` devuelve `true` a todo. Nada falla y nadie se entera. Con eso:
  - **Login:** la pausa de 1,5 s (`entrar.astro:23`) solo frena una petición cada vez. Un atacante lanza cientos de peticiones en paralelo contra `/panel/entrar` y prueba contraseñas sin límite. `PANEL_CLAVE` solo exige 10 caracteres.
  - **Formularios:** solo queda la trampa `web`, que los bots dirigidos se saltan. Los formularios pasan a enviar emails a cualquier dirección (ver 🔵 «Formularios usados para mandar emails a terceros»).
- **Impacto:** se puede adivinar la contraseña del panel por fuerza bruta, lo que daría acceso a todos los datos personales. También entraría spam en masa.
- **Arreglo sugerido:**
  - En producción (`!import.meta.env.DEV`), si `TURNSTILE_SITE_KEY` está puesta pero falta el secreto, **rechazar** en vez de aceptar. Y registrar el error con `console.error` para que se vea en los logs.
  - En `entrar.astro`, exigir Turnstile siempre que haya `PANEL_CLAVE`.
  - Añadir un límite de intentos fallidos por IP (por ejemplo, una regla de Rate Limiting de Cloudflare sobre `POST /panel/entrar`, o el binding `ratelimit` de Workers).
  - Lo ideal sigue siendo pasar a Cloudflare Access cuando haya dominio.
- **Tamaño:** S (lo de rechazar sin secreto) o M (el límite de intentos).
- **¿Toca textos?:** no. Se reutiliza el mensaje que ya existe: «No hemos podido comprobar que no eres un robot. Vuelve a intentarlo.»

#### 3. La importación con IA envía a Groq datos que la política de privacidad no menciona
- **Dónde:** `src/lib/importar.ts:280-296` (`extraerConIA` manda el texto pegado entero), `src/pages/privacidad.astro:38`.
- **Escenario:** Iris pega en «Añadir alumnas» una lista con nombre, teléfono, email y nombre del menor. No lleva cabeceras, así que va a Groq (EE. UU.). La política solo dice que Groq «puede recibir nombres de talleristas y de personas que han hecho una petición cuando quien administra la web le pide un cambio». No dice nada de teléfonos, emails, alumnas ni menores.
- **Impacto:** la información a las personas interesadas está incompleta (RGPD, art. 13). Hay datos de menores de por medio.
- **Arreglo sugerido:** hay dos caminos.
  - **Sin cambiar textos:** antes de llamar a Groq, quitar o enmascarar del texto los emails y teléfonos (sustituirlos por marcadores y volver a ponerlos al recibir la respuesta). También se puede desactivar la IA para el tipo `alumnas` y exigir CSV con cabeceras.
  - **Con texto:** ampliar la frase de Groq en `privacidad.astro`.
- **Tamaño:** M (enmascarar) o S (desactivar la IA para alumnas).
- **¿Toca textos?:** depende del camino. Ampliar la política **necesita texto de Iris**. Enmascarar o desactivar no toca textos.

#### 4. El enlace de la tallerista no caduca y sigue mostrando nombres y teléfonos de las alumnas
- **Dónde:** `src/pages/t/[codigo].astro:39-43`.
- **Escenario:** el enlace `/t/<codigo>` va por email y suele acabar reenviado por WhatsApp. Mientras el taller esté `publicado` muestra la lista de apuntadas con nombre y teléfono, también meses después del taller. Quien tenga el enlace (otra persona del taller, un buzón comprometido) ve esos datos. Además puede marcar reservas como pagadas o cancelarlas, aunque solo las de ese taller, porque eso sí está bien limitado con `cambiarEstadoReserva(..., t.id)`.
- **Impacto:** los datos personales quedan expuestos más tiempo del necesario (minimización y conservación).
- **Arreglo sugerido:** dejar de cargar `apuntadas` y rechazar los POST de cobros cuando `t.fecha` sea anterior a hoy menos N días (por ejemplo, 7). Al terminar ese plazo, la página puede mostrarse como cuando el taller no está publicado. Iris ya puede regenerar el enlace (`panel/talleres/[id].astro:78-80`).
- **Tamaño:** S
- **¿Toca textos?:** no, siempre que se reutilice el estado que ya existe. Si se quiere explicar «este taller ya terminó», **necesita texto de Iris**.

### 🔵 Notas y buenas prácticas

#### Formularios usados para mandar emails a terceros (relé de spam)
- **Dónde:** `src/lib/avisos.ts:169-177` (bonos y privados) y `avisos.ts:100-120` (reservas). Los dispara cualquier envío con un email ajeno.
- **Escenario e impacto:** el remitente es Yutori y el atacante controla el primer «nombre» (hasta 120 caracteres sin espacios, por ejemplo una URL). Turnstile frena la automatización, así que el riesgo es bajo mientras funcione (ver 🟡 2), pero puede afectar a la reputación del dominio de envío.
- **Arreglo sugerido:** limitar a 1 email al mismo destinatario cada X minutos, o no incluir en el saludo nada que haya escrito el usuario si contiene `://` o `www.`.
- **Tamaño:** S · **¿Toca textos?:** no (el saludo solo pierde el nombre en esos casos).

#### Se puede reservar un taller cuya fecha ya pasó
- **Dónde:** `src/lib/reservas.ts:54-57` (`tallerPublicado` no filtra por fecha) y `:73`.
- **Escenario e impacto:** un taller que sigue `publicado` después de su fecha admite reservas. Esas reservas generan avisos a la tallerista y emails a la alumna. Es más un fallo de funcionamiento que de seguridad.
- **Arreglo sugerido:** añadir `AND t.fecha >= hoyEspana()` en el `INSERT` y ocultar el formulario.
- **Tamaño:** S · **¿Toca textos?:** sí, si hay que explicar que ya pasó (**necesita texto de Iris**). No, si se trata como «completo».

#### Carrera entre el envío de la tallerista y la publicación
- **Dónde:** `src/pages/t/[codigo].astro:86-91`.
- **Escenario e impacto:** el `UPDATE` no comprueba el estado actual. Si Iris publica el taller mientras la tallerista tiene el formulario abierto, el envío lo devuelve a `enviado` (lo quita de la web) y cambia el precio y las plazas.
- **Arreglo sugerido:** añadir `AND estado IN ('hueco','enviado')` y comprobar `meta.changes`.
- **Tamaño:** S · **¿Toca textos?:** no (reutiliza «Algo ha fallado al guardar…»).

#### Cerrar sesión no invalida la cookie en el servidor
- **Dónde:** `src/lib/sesion.ts:102-115`, `src/pages/panel/salir.ts`.
- **Escenario e impacto:** una cookie robada sigue valiendo hasta 12 h aunque Iris pulse «Salir». Solo cambiar `PANEL_CLAVE` las invalida todas.
- **Arreglo sugerido:** aceptarlo (es razonable) o añadir una versión de sesión en D1 o KV.
- **Tamaño:** S/M · **¿Toca textos?:** no.

#### Falta una CSP completa
- **Dónde:** `src/middleware.ts:11`, `public/_headers`.
- **Escenario e impacto:** solo hay `frame-ancestors 'none'`. Hoy no hay ningún XSS (no hay `set:html` y Astro escapa todo), pero una CSP sería una segunda defensa.
- **Arreglo sugerido:** `default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com` con hashes para los `is:inline`, `frame-src https://challenges.cloudflare.com`, `img-src 'self' data:`. Añadir también `includeSubDomains` a HSTS cuando haya dominio propio.
- **Tamaño:** M · **¿Toca textos?:** no.

#### Comprobaciones con `in` sobre objetos aceptan claves del prototipo
- **Dónde:** `src/pages/panel/solicitudes.astro:11` y `:22`, `src/pages/panel/reservas.astro:21-22`.
- **Escenario e impacto:** `'toString' in ESTADOS_SOLICITUD` da `true`. Solo afecta al panel (ya autenticado) y acaba en un 500 por el `CHECK` de la tabla. Sin impacto real.
- **Arreglo sugerido:** usar `Object.hasOwn(...)`.
- **Tamaño:** S · **¿Toca textos?:** no.

#### Fotos huérfanas en R2
- **Dónde:** `src/pages/colabora.astro:51-59`.
- **Escenario e impacto:** las fotos se suben antes del `INSERT`. Si el `INSERT` falla, quedan en `propuestas/` sin dueño. Además la política promete borrar las propuestas a los 2 años.
- **Arreglo sugerido:** borrarlas en el `catch`.
- **Tamaño:** S · **¿Toca textos?:** no.

#### La conservación de datos no está automatizada
- **Dónde:** `src/pages/privacidad.astro:46-48`.
- **Escenario e impacto:** la política promete 1 año para peticiones y 2 para propuestas, pero no hay ningún borrado automático. Para reservas ni siquiera hay borrado manual en el panel.
- **Arreglo sugerido:** un Cron Trigger mensual que borre o anonimice según esos plazos.
- **Tamaño:** M · **¿Toca textos?:** no.

#### Google Calendar recibe nombres y teléfonos de las alumnas
- **Dónde:** `src/lib/calendario.ts:52-60`.
- **Escenario e impacto:** la descripción de cada evento lleva la lista de apuntadas. Google ya figura como encargado en la política, pero si el calendario se comparte con talleristas o con otras personas, verían datos de reservas de otros talleres.
- **Arreglo sugerido:** confirmar que el calendario es privado, o dejar en la descripción solo el recuento y el enlace al panel.
- **Tamaño:** S · **¿Toca textos?:** no.

---

## Lo que está bien hecho (mantenerlo)

**Panel y sesión**
- **Protección central del panel** en `middleware.ts`: con Cloudflare Access verifica el JWT con `jose` (emisor y audiencia); sin Access ni `PANEL_CLAVE`, el panel da 404; Astro 7 normaliza `context.url`, así que `/%70anel` o `//panel` no se saltan el prefijo.
- **Cookie de sesión** firmada con HMAC y comparada en tiempo constante: `HttpOnly; Secure; SameSite=Strict; Path=/panel`, con caducidad de 12 h.
- **`volver` en `/panel/entrar`** limitado a `/panel…`, así que no se puede redirigir a otra web.
- **Asistente e importación con IA:** la respuesta de la IA se valida con zod al recibirla y otra vez al aplicarla. Iris revisa cada acción antes de que se guarde. Las columnas de `INSERT`/`UPDATE` dinámicos salen de mapeos fijos.

**Formularios y datos**
- **CSRF:** `security.checkOrigin: true` junto con `SameSite=Strict`. Todas las acciones que cambian datos son POST, cerrar sesión también.
- **SQL** siempre parametrizado.
- **Formularios públicos:** cumplen la skill `formulario-publico` (lectura acotada, trampa `web`, validación en servidor, Turnstile, redirección 303, consentimientos con fecha).
- **Plazas:** se comprueban y se reservan en una sola sentencia. Los importes se calculan en el servidor.

**Enlaces privados y fotos**
- **Códigos privados:** `/t/` usa 18 bytes aleatorios (~144 bits); reservas con 18 bytes en talleres y `randomblob(12)` en clases, con `UNIQUE`. Sin IDOR (`AND taller_id = ?3`).
- **Páginas privadas:** `noindex`, `Cache-Control: private, no-store`, `Disallow` en robots.txt, `Referrer-Policy` y sin analítica.
- **Fotos:** tipo comprobado por los primeros bytes (sin SVG), nombre aleatorio, ruta validada con expresión regular estricta, las de `propuestas/` solo desde el panel, siempre con `nosniff`.

**Emails y secretos**
- **Emails:** HTML escapado antes de las `**negritas**`, envío con `waitUntil`, un fallo no rompe la reserva.
- **Secretos** fuera del repo; en `wrangler.jsonc` solo hay valores públicos.

---

## Erratas propuestas para Iris

Sin revisión ortográfica completa; solo lo visto al leer el código.

- `src/pages/privacidad.astro:48`: «incluidas las que quedan "en reserva" para el futuro» usa comillas rectas `"…"`. En el resto de la web se usan las latinas «…». Propuesta: «quedan «en reserva» para el futuro» (o sin comillas).
