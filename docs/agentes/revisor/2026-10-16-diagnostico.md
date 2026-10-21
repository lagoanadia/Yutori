# Revisión completa de `src/` · Yutori

**Fecha:** 2026-10-16 · **Agente:** revisor (solo lectura) · **Alcance:** todo `src/` y `migrations/` como referencia. Diagnóstico del estado actual, sin diff.

> Nota de la sesión principal: el hallazgo n.º 4 («`/talleres` solo enseña el mes en curso») es un comportamiento **pedido a propósito** en el commit `eaf34b5` («calendario solo del mes en curso»). No es un fallo; queda como pregunta para Iris por si el día 20 quiere enseñar también el mes siguiente.

## Resumen

La base está bien hecha: SQL siempre con parámetros, `reservarTaller()` atómico, sesiones firmadas con HMAC, panel con `prerender = false` protegido por el middleware y emails que nunca rompen una reserva. Los problemas serios están en las **plazas de las clases**: dos caminos permiten meter más alumnas de las que caben, en contra de la regla «Plazas» del `CLAUDE.md`. Hay además fallos de flujo con escenario concreto. **Ningún arreglo propuesto cambia un texto visible.**

---

## 🔴 Bloqueantes

### 1. «Renovar alumnas» no comprueba plazas y puede pasarse del cupo
- **Dónde:** `src/lib/clases.ts:163-177` (`renovarMes`), desde `src/pages/panel/clases.astro:15-16`.
- **Problema:** copia las mensuales confirmadas al mes siguiente sin mirar las plazas libres.
- **Escenario:** desde el día 20, `mesInscripcion()` (`clases.ts:44-47`) abre el mes siguiente en la web. Grupo de 8 con 8 confirmadas en octubre; el 21/10 se apuntan 3 nuevas a noviembre; el 22/10 Iris pulsa «Renovar alumnas» → 11 alumnas en un grupo de 8. Las renovadas quedan `pendiente` con `caduca_en = NULL` (nunca se liberan) y se renuevan aunque el horario esté desactivado.
- **Arreglo:** que el `INSERT … SELECT` haga JOIN a `grupos g` (`g.activo = 1`) y renueve solo mientras quepan; devolver cuántas no cupieron para avisar a Iris.
- **Tamaño:** M · **Toca textos:** no

### 2. La plaza mensual no cuenta las clases sueltas ya vendidas
- **Dónde:** `src/lib/clases.ts:133` (`reservarMensual`); también `src/pages/clases/pedir-plaza.astro:20` (`libresMes`) y `src/pages/clases.astro:26`.
- **Problema:** la mensual solo resta mensuales; la suelta (`clases.ts:151`) resta mensuales y sueltas.
- **Escenario:** grupo de 8 con 7 mensuales; se vende una suelta para el 3/11; después alguien coge la mensual → el 3/11 hay 9 personas.
- **Arreglo:** en la misma sentencia, exigir que ninguna sesión del mes tenga sueltas que la dejen sin sitio (`AND NOT EXISTS (... GROUP BY s.fecha_sesion HAVING g.plazas - MENSUALES - count(*) < 1)`), y el mismo criterio en `libresMes` y `/clases`.
- **Tamaño:** M · **Toca textos:** no

---

## 🟡 Conviene arreglar

3. **Se puede reservar un taller que ya ha pasado.** `src/lib/reservas.ts:54-57` y `:63-73`; `src/pages/talleres/[slug].astro:11`. Un enlace antiguo compartido en Instagram sigue aceptando reservas. Arreglo: `AND t.fecha >= hoyEspana()` en el `INSERT` y no pintar el formulario si ya pasó (sin texto nuevo). S · no.
4. **`/talleres` solo enseña el mes en curso** (`src/pages/talleres/index.astro:9-11`). *Pedido a propósito en `eaf34b5`: pregunta para Iris, no fallo.* S · no.
5. **Clase nueva creada desde el panel sale a medias.** `src/lib/importar.ts:410-413` crea `clases` activa sin `texto`, `temas` ni `precio_suelta_cent`; no hay pantalla para rellenarlos. El email de clase suelta sale con «paga ****» (`src/lib/avisos.ts:99,116`). Arreglo: crearla con `activa = 0` o no ofrecer sueltas sin precio; omitir el fragmento del importe si está vacío. M · no.
6. **El email de una mensual de precio variable cobra el mínimo.** `src/lib/avisos.ts:99` frente a `src/pages/reserva/[codigo].astro:18` («50-60 €/mes»). Arreglo: mismo formato de rango con una función compartida. S · no.
7. **Importar horarios da 500 si el nombre de la clase no coincide letra a letra.** `src/lib/importar.ts:145` (normaliza) frente a `:416` (comparación exacta) → `clase_id` NULL en columna `NOT NULL`. Igual con «Cerámica»/«cerámica» nuevas (slug duplicado). Arreglo: usar el nombre o id guardado, agrupar nuevas por nombre normalizado y `try/catch` con error legible. S · no.
8. **Importar alumnas: «sin pagar» se guarda como pagada.** `src/lib/importar.ts:228`: `sin_pagar` cumple `/^(pagad|confirm|si)/`. Arreglo: negativos primero y `^si$`. S · no.
9. **Una foto con formato falso tumba la edición de un taller.** `src/pages/panel/talleres/[id].astro:46` y `src/lib/talleres.ts:132`: `guardarFoto` lanza sin `try/catch` (en `/t/[codigo]` sí lo hay). Un HEIC renombrado da 500 y se pierde el formulario. S · no.
10. **Botones-enlace por debajo de 48 px.** `src/styles/global.css:186` (`.boton-texto`), `.enlace-nuevo` (`panel/talleres/[id].astro:299`), `.barra__salir` (`layouts/Panel.astro:71`): ~30 px. «Cancelar reserva» pegado a «Pago recibido» en `/t/[codigo]`. Arreglo: `min-height: 48px; display: inline-flex; align-items: center`. S · no.

---

## 🔵 Notas y sugerencias

11. `src/pages/panel/index.astro:16`: `date('now')` en UTC en vez de `hoyEspana()`. S · no.
12. `src/pages/clases.astro:10`: no llama a `liberarCaducadas()` antes de `ocupacionMes`. S · no.
13. Código muerto: `grupoPorId` y `libresSesion` (`lib/clases.ts:25,82`); `clases`, `publicosVisibles` y tipos en `src/data/yutori.ts:78-172` (la web lee D1). Confirmar con Iris antes de borrar. S · no.
14. Comentario que miente en `src/pages/reserva/[codigo].astro:28` (mensuales sin enlace de calendario). S · no.
15. `src/pages/clases/pedir-plaza.astro:121-128`: modalidades fijas en el HTML en vez de `g.modalidades`. S · no.
16. `src/pages/clases.astro:23-25`, `:45-49`: precio solo de `lista[0]` y `/100` sin `eurosCorto`. S · no.
17. `src/pages/clases.astro:64`: «Grupo máximo de 8 personas» sale de una constante, pero `grupos.plazas` puede ser 1-30 (importación sin tope, `importar.ts:153`). S · no.
18. Lógica duplicada: consulta de reserva en `lib/avisos.ts:79-89` y `lib/reservas.ts:91-107`; formato del precio mensual en dos sitios; `/fotos/${foto}` en vez de `urlFoto()`; widget de Turnstile repetido a mano en `talleres/[slug].astro`, `colabora.astro` y `pedir-plaza.astro` en vez de `components/Turnstile.astro`. M · no.
19. `src/lib/asistente.ts:146`: `buscarSolicitud` sin prioridad a la coincidencia exacta («Ana» frente a «Mariana»). S · no.
20. `src/lib/calendario.ts:79-84`: dos sincronizaciones a la vez pueden duplicar el evento de Google Calendar. S · no.
21. `src/lib/reservas.ts:110-121`: `cambiarEstadoReserva` no dice si cambió algo; el panel dice «Cambios guardados.» sin haber hecho nada. S · no.
22. `src/pages/panel/solicitudes.astro:22-23`: `params.get('estado') in …` con `string | null`. S · no.
23. `src/pages/panel/solicitudes/[id].astro:35`: solo categorías activas; una petición antigua pierde su categoría desactivada al guardar. S · no.
24. `src/pages/t/[codigo].astro:63`: `Number('')` = 0 € sin el `required`; `:93` avisa a Iris en cada corrección. S · no.
25. `bonos.astro:45` y `privados.astro:43` sin `try/catch` en el `INSERT`; fotos huérfanas en `colabora.astro:52`. S · no.
26. `src/pages/sitemap.xml.ts:8`: rutas con y sin barra final. S · no.
27. Accesibilidad menor: `Resenas.astro:16` sin `role="img"`; foco `--salvia` ~1,9:1 (`global.css:160`); `t/[codigo].astro:188` usa `aria-label` en vez de `<label for>`. S · no.
28. `src/pages/panel/solicitudes.astro:50`: WhatsApp con «()» si no hay `motivo`. S · no.

---

## Erratas propuestas para Iris

1. `src/data/yutori.ts:52`: «En nuestros talleres los materiales están siempre incluidos.», pero una tallerista puede marcar que hay que traer algo. Sugerencia: «…están incluidos, salvo que la ficha del taller indique lo contrario.»
2. `src/data/yutori.ts:59`: «Más de 7 días antes: reembolso o cambio al próximo taller.», pero la política completa (`:176`) lo limita a «por causa de fuerza mayor». Confirmar cuál vale.
3. Descripción de «Aguadas»: la publicada (`migrations/0004_clases_reales.sql:20`) es la corta; en `src/data/yutori.ts:132` (sin uso) está la larga. ¿Cuál es la buena?
4. `src/pages/privacidad.astro:38` (Groq): no menciona los datos de contacto de las listas que se importan con IA. Sugerencia de ampliación en el informe de seguridad.
5. `src/pages/colabora.astro:84`: «…nuevas ideas, cuéntanos la tuya.» → «…nuevas ideas: cuéntanos la tuya.»
6. `src/layouts/Base.astro:22-27` (menú): «Clases Semanales», «Talleres Privados», «Bonos Regalo», «Imparte tu Taller» → mayúscula solo inicial (opcional).
7. `src/pages/espacio.astro:9`: «centro de Coruña» → «centro de A Coruña» (opcional).

## Veredicto

**Listo tras arreglar los 🔴.** Del bloque 🟡, conviene pronto el n.º 3 (reservas de talleres ya pasados), porque lo ve cualquier visitante.
