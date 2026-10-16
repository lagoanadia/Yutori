# Diagnóstico priorizado · 2026-10-16

Resumen de los cuatro informes de la fase 1, sin repetir lo que han encontrado varios agentes:

- `docs/agentes/revisor/2026-10-16-diagnostico.md`
- `docs/agentes/seguridad/2026-10-16-diagnostico.md`
- `docs/agentes/auditor-web/2026-10-16-diagnostico.md`
- `docs/agentes/director-arte/2026-10-16-propuesta.md` (capturas del antes en `docs/agentes/director-arte/capturas/2026-10-16-antes/`)

Tamaño: S (horas), M (un día aprox.), L (varios días). «¿Toca textos?» = si el arreglo obliga a cambiar o añadir un texto visible.

## Lista priorizada

| ID | Prioridad | Qué es | Agente(s) | Trabajo | ¿Toca textos? |
|---|---|---|---|---|---|
| A1 | Alta | «Renovar alumnas» copia el mes sin mirar plazas: un grupo de 8 puede acabar con 11 (y renueva horarios desactivados) | revisor | M | no |
| A2 | Alta | La plaza mensual no cuenta las clases sueltas vendidas: 9 personas en un grupo de 8 | revisor | M | no |
| A3 | Alta | Se puede reservar un taller cuya fecha ya pasó (enlaces viejos de Instagram) | revisor, seguridad | S | no |
| A4 | Alta | Si falta el secreto de Turnstile, se acepta todo sin avisar y el login del panel queda sin freno (fuerza bruta) | seguridad | S (rechazar) / M (límite de intentos) | no |
| A5 | Alta | Anillo de foco con contraste 1,85:1 (WCAG pide 3:1) | auditor-web, director-arte, revisor | S | no |
| A6 | Alta | `logo.svg` pesa 222 KB (65 % de cada página) y no se cachea | auditor-web, director-arte | M | no |
| A7 | Alta | Cualquiera puede bloquear las plazas de un taller 24 h con reservas falsas | seguridad | M | **sí**: rechazar una reserva repetida necesita un mensaje nuevo de Iris |
| M1 | Media | Texto verde sobre salvia suave a 4,47:1 (etiquetas, píldoras, huecos de foto) y borde de campos a 1,55:1 | auditor-web, director-arte | S | no |
| M2 | Media | Objetivos táctiles por debajo de 48 px: botón «Menú», pie, casillas, «Cancelar reserva» en `/t` | auditor-web, revisor, director-arte | S | no |
| M3 | Media | Rediseño de tarjetas de talleres: foto a sangre, tarjeta entera pulsable, hora sin cortes, «Completo» en segundo plano, sin huérfanas | director-arte | S | no |
| M4 | Media | Portada: arco a todos los anchos (la tablet hoy es solo foto), titulares sin palabras sueltas, mariposa como marca de agua, rejilla 2×2/4×1 | director-arte | S-M | no |
| M5 | Media | Ficha de taller en móvil: título y «Cuándo» en la primera pantalla, precio y plazas destacados, formulario en tarjeta | director-arte | S | no |
| M6 | Media | El enlace `/t` de la tallerista enseña nombres y teléfonos de alumnas para siempre | seguridad | S | no |
| M7 | Media | La importación con IA manda a Groq teléfonos y emails que la política de privacidad no menciona (se arregla enmascarándolos) | seguridad, revisor | M | no (enmascarar) / sí (ampliar la política) |
| M8 | Media | Importador: error 500 si el nombre de la clase no coincide letra a letra; «sin pagar» se guarda como pagada | revisor | S | no |
| M9 | Media | Clase nueva desde el panel: sale en la web a medias, email con «paga ****»; email de mensual con precio mínimo en vez de rango | revisor | M | no |
| M10 | Media | Subir una foto con formato falso en el panel da error 500 y se pierde el formulario | revisor | S | no |
| M11 | Media | SEO para publicar: JSON-LD (negocio y talleres), barra final unificada en sitemap, enlaces y canónico | auditor-web, revisor | M | no |
| M12 | Media | Las fotos de R2 se sirven sin redimensionar (hasta 5 MB) | auditor-web | M | no |
| M13 | Media | Menú: escritorio desde 960 px, estados hover, panel móvil con fondo y cierre al pulsar fuera o con Esc | director-arte, auditor-web | M | no |
| M14 | Media | Movimiento: transición de tarjeta a ficha, apariciones suaves, hover; `scroll-behavior` que respeta «reducir movimiento» | director-arte, auditor-web | S | no |
| B1 | Baja | Fuentes: cargar solo el subset latin y precargar las dos de la primera pantalla | auditor-web | S | no |
| B2 | Baja | Accesibilidad menor: espacio en el h3 de clases, estrellas con `role="img"`, tablas legales enfocables, foco a los errores tras enviar, `accent-color` en radios | auditor-web, director-arte | S-M | no |
| B3 | Baja | CSP completa como segunda defensa | seguridad | M | no |
| B4 | Baja | Borrado automático según los plazos de la política de privacidad (Cron) | seguridad | M | no |
| B5 | Baja | Robustez y duplicados: Turnstile repetido a mano, `try/catch` en bonos y privados, fotos huérfanas, carrera en `/t`, «hoy» en UTC en el panel, código muerto… (notas 11-28 del revisor) | revisor, seguridad | M | no |
| B6 | Baja | Ficha de taller en escritorio sin el hueco vacío bajo la foto | director-arte | M | no |
| B7 | Baja | Resto de páginas con el mismo sistema (clases, bonos, privados, colabora, espacio, pie) | director-arte | S cada una | no |

## Decisiones para Iris (no son erratas)

1. **Mayúsculas forzadas por CSS**: `.etiqueta` muestra «EVENTO ESPECIAL» aunque está escrito «Evento especial», y `.mes__titulo` muestra «Octubre». Hoy la referencia de textos guarda la versión en mayúsculas (es lo que se ve). Si Iris prefiere verlo como está escrito, el script de comparación lo marcará como diferencia: será un cambio de texto pedido.
2. **Botón en la primera pantalla de la portada** (hoy no hay ninguno): reutilizar «Ver calendario» y «Regalar un bono» u otros.
3. **`/talleres` solo con el mes en curso** (pedido en `eaf34b5`): ¿desde el día 20 enseñar también el mes siguiente, que ya está en la portada?
4. **Textos nuevos que harían falta**: mensaje al rechazar una reserva repetida (A7); `alt` de las fotos; `og:image:alt`; teléfono y horario para el JSON-LD; ampliar la frase de Groq si se elige ese camino (M7).

## Erratas propuestas para Iris

| Dónde | Texto actual | Propuesta | Agente(s) |
|---|---|---|---|
| Menú (`Base.astro:22-27`) | «Clases Semanales», «Talleres Privados», «Bonos Regalo», «El Espacio», «Imparte tu Taller» | Mayúscula solo inicial, como los títulos de cada página | revisor, director-arte |
| `/espacio` (`espacio.astro:9`) | «…en el centro de Coruña» | «…en el centro de A Coruña» (si no es intencionado) | los tres |
| `/privacidad` (`privacidad.astro:48`) | `"en reserva"` | «en reserva» | seguridad, auditor-web |
| `/colabora` (`colabora.astro:84`) | «…nuevas ideas, cuéntanos la tuya.» | «…nuevas ideas: cuéntanos la tuya.» | revisor |
| Ficha de taller | «Nombre y apellido» | «Nombre y apellidos» | director-arte |
| «Antes de reservar» (`yutori.ts:52`) | «…los materiales están siempre incluidos.» | «…están incluidos, salvo que la ficha del taller indique lo contrario.» (hay talleres con «Trae: …») | revisor |
| «Antes de reservar» (`yutori.ts:59`) | «Más de 7 días antes: reembolso o cambio al próximo taller.» | Coherente con la política completa, que exige «causa de fuerza mayor» | revisor |
| Días y meses generados (`db.ts:57`, `yutori.ts:191`) | «Cuándo: Sábado 17…», «Octubre, Lunes 18:00-19:30h» | Minúscula en medio de la frase | auditor-web |
| Horas | «18:00-19:30», «18:00-19:30h», «de 10:30 a 13:00», «10:30-13:00» | Un único formato | auditor-web |
| Portada / Talleres | «de la mano de artesanas y artistas» / «con artesanas y artistas» | Unificar | director-arte |
| Clase «Aguadas» | Versión corta publicada (`migrations/0004`) y versión larga en `yutori.ts:132` sin uso | Confirmar cuál es la buena | revisor |
| Dirección | «Plaza Pontevedra 14, 1-1º-B2» | ¿«1º-B2»? | auditor-web |
| Descripciones (`<meta>`) | 6 páginas (y el 404) con la descripción por defecto | Una propia para cada una (ejemplos en el informe del auditor) | auditor-web |
| Título de `/clases/pedir-plaza` | «Reservar plaza · Yutori Espacio Creativo» | Que diga qué clase es | auditor-web |
| Legales | «Titular: [pendiente]», «NIF [pendiente]», «Borrador» | Rellenar antes de publicar (LSSI) | auditor-web |
| Lema de la portada | Dos frases | Opcional: solo la primera en la portada | director-arte |
