# Propuesta de dirección de arte · Yutori Espacio Creativo

**Fecha:** 2026-10-16 · **Agente:** director-arte (modo A, propuesta) · **Estado:** pendiente de aprobación
**Alcance:** portada, tarjetas de talleres, fichas de taller, menú (escritorio y móvil) y movimiento. Notas breves del resto de páginas.
**Regla aplicada:** no se cambia ningún texto. Todas las propuestas tienen «¿Toca textos? No». Lo que afectaría al texto está en la sección 7, «Erratas y propuestas de texto para Iris».

Capturas del «antes» (360, 768 y 1280 px; página completa y `-pantalla` para la primera pantalla): `docs/agentes/director-arte/capturas/2026-10-16-antes/`. Comprobado en las 24 combinaciones de página y ancho: **ninguna página tiene scroll horizontal**.

---

## 1. Concepto: «Espacio para respirar»

*Yutori* (ゆとり) es una palabra japonesa que significa holgura: tener margen, tiempo y espacio de sobra, sin prisa. El logo cuenta lo mismo con un dibujo: media mariposa y media flor, algo que se transforma con calma y hecho a mano.

- **Holgura**: más aire alrededor de lo importante y menos cajas con borde y sombra a la vez.
- **Hecho a mano**: el arco de la portada (que ya existe) y el trazo fino del logo pasan a ser el lenguaje de la web: arcos en las fotos y líneas finas como separadores.
- **Sin prisa**: movimiento lento y suave, que nunca bloquea nada. La web se usa igual de bien sin él.
- **Salvia de origen**: el logo original de Canva es la mariposa en negro sobre salvia `#8bb9ad`. Hoy el salvia casi no aparece. Se recupera como superficie de marca, nunca como color de texto.

Evolución, no ruptura: se mantienen los colores, el logo, las tres tipografías y el tono.

---

## 2. Diagnóstico del «antes»

### Qué funciona (se mantiene)
- Paleta crema, verde y salvia cálida y coherente. Tinta sobre crema **11,21:1**; verde sobre crema **4,74:1**.
- Buena combinación de tipografías; Parisienne como antetítulo da carácter sin estorbar.
- El arco de la foto de portada (`src/pages/index.astro:81`) es el mejor recurso visual, pero solo aparece una vez.
- Botones en píldora de 48 px o más con dos variantes claras (`src/styles/global.css:69-89`).
- Estructura semántica: `details` para el menú móvil, `aria-current` y enlace para saltar al contenido.

### Qué no funciona

**Portada**
1. **Ninguna acción en la primera pantalla** (`index.astro:19-30`; `inicio-360-pantalla.png`, `inicio-1280-pantalla.png`).
2. **A 768 px la foto ocupa casi una pantalla entera**: `aspect-ratio: 4/5` a 736 px ≈ 920 px de alto (`index.astro:79-85`; `inicio-768-pantalla.png`).
3. **Palabra suelta en el titular**: «…en el centro de A / Coruña» a 360 px; «Coruña» sola a 768 px.
4. **La tarjeta con la mariposa repite el logo** de la cabecera (`index.astro:27,82`). `logo.svg` pesa **217 KB** y se carga en todas las páginas.
5. **«Qué puedes hacer en Yutori» deja una tarjeta huérfana**: 3 + 1 a 1280 px (`global.css:94-98`). Las cuatro tarjetas son iguales, sin jerarquía.

**Tarjetas de talleres** (`src/components/TallerCard.astro`)
6. Solo se puede pulsar el botón, no la tarjeta; sin hover (`TallerCard.astro:11-27`).
7. La hora se parte por el guion a 360 px: «10:30- / 13:00» (`TallerCard.astro:18`).
8. Un taller completo pesa lo mismo que uno disponible (`talleres-1280.png`, «Lámparas de origami»).
9. Tarjeta huérfana a 768 px: 2 + 1 (`talleres-768.png`).
10. Tarjetas dentro de tarjetas (borde, sombra, padding y otra caja para la foto): ruido que resta protagonismo a la foto.

**Ficha de taller** (`src/pages/talleres/[slug].astro`)
11. A 360 px el título empieza a 532 px y el formulario a 1132 px (`[slug].astro:56-58,124`).
12. A 1280 px la columna de la foto queda vacía ~600 px bajo la imagen.
13. Precio y plazas se ven igual que la duración (`[slug].astro:65-71,126-127`).

**Menú**
14. El menú de escritorio solo aparece desde 1100 px (`Base.astro:166-170`); a 1024 px se usa el móvil.
15. Enlaces de escritorio sin hover y de 27 px de alto; la página actual solo con subrayado (`Base.astro:137-138`).
16. El botón «Menú» mide 47 px, por debajo de 48 px (`Base.astro:140-148`).
17. El menú móvil aparece de golpe, sin fondo que oscurezca ni cierre al pulsar fuera (`menu-movil-abierto-360.png`, `Base.astro:150-162`).

**Color y accesibilidad**
18. Verde sobre salvia suave da 4,48:1 (< 4,5) en `.etiqueta` (`global.css:109-120`) y píldoras de temas (`clases.astro:108`).
19. Anillo de foco salvia sobre crema: **1,85:1** (< 3:1) (`global.css:159-162`).
20. Estrellas `#c8963e` sobre crema: 2,26:1 (`Resenas.astro:16,39`).
21. Radios de «Tipo de bono» en azul del navegador: falta `accent-color` (`bonos-1280.png`).
22. `.etiqueta` usa `text-transform: uppercase` (`global.css:114`): choca con la regla de textos. No se toca: pregunta para Iris (sección 7).

**Pie y ritmo**
23. Franja crema entre la sección salvia y el pie por `margin-top: 48px` (`Base.astro:172`).
24. El email del pie se parte a 768 px: «…@g / mail.com» (`Base.astro:177`).

**Movimiento**
25. No hay movimiento, salvo `scroll-behavior: smooth`, que está **fuera** de `prefers-reduced-motion` (`global.css:24`).

---

## 3. Propuesta por sección

### 3.1 Portada (`src/pages/index.astro`)

| # | Propuesta | Tamaño | ¿Toca textos? |
|---|---|---|---|
| P1 | Portada en arco a cualquier ancho: a 360/768 px foto en arco más bajo (`4/3` móvil, `3/2` tablet, `max-height: 60svh`) con el titular encima; desde 860 px, dos columnas como ahora. | S | No |
| P2 | `text-wrap: balance` en `h1, h2` y `text-wrap: pretty` en párrafos (solo cambia dónde se parte la línea). | S | No |
| P3 | Mariposa como marca de agua en trazo fino y baja opacidad saliendo del arco, sin caja; fondo del arco sin foto en `--salvia`. | S | No |
| P4 | Logo optimizado con SVGO (< 60 KB) y versión simplificada para la cabecera. | M | No |
| P5 | «Qué puedes hacer» en 2 × 2 (≥ 600 px) o 4 × 1 (≥ 1000 px), sin sombra, línea superior verde, arco salvia de cabecera, botón abajo. | S | No |
| P6 | Hueco preparado para una acción principal bajo el lema, **sin rellenar** hasta que Iris apruebe el texto; «Próximos talleres» sube (padding 56 → 32 px). | S | No (texto pendiente de Iris) |
| P7 | Reseñas: estrellas con `--oro`, tarjetas sin sombra y comilla decorativa con `aria-hidden`. | S | No |

### 3.2 Tarjetas de talleres (`src/components/TallerCard.astro`)

| # | Propuesta | Tamaño | ¿Toca textos? |
|---|---|---|---|
| T1 | Foto a sangre arriba con esquinas en arco suave; sin sombra en reposo, borde de 1 px. | S | No |
| T2 | Toda la tarjeta pulsable con «enlace estirado» (`::after` del botón). | S | No |
| T3 | Hora sin cortes: `<span>` con `white-space: nowrap` (mismos caracteres). | S | No |
| T4 | Jerarquía: fecha como antetítulo en `--verde-oscuro`; precio y plazas en fila; plazas como píldora (6,15:1). | S | No |
| T5 | Taller completo: foto desaturada y píldora «Completo» en `--aviso` sobre `--crema-claro` (4,87:1). | S | No |
| T6 | Rejilla sin huérfanas (`auto-fit, minmax(min(100%, 300px), 1fr)` y ancho máximo por tarjeta). | S | No |
| T7 | `view-transition-name: foto-<slug>` en la foto. | S | No |

### 3.3 Ficha de taller (`src/pages/talleres/[slug].astro`)

| # | Propuesta | Tamaño | ¿Toca textos? |
|---|---|---|---|
| F1 | Móvil: foto 4:3 con `max-height: 45svh` en arco; «← Todos los talleres» encima. h1 y «Cuándo» en la primera pantalla. | S | No |
| F2 | Escritorio sin hueco: foto ancha arriba (21:9 en arco) y debajo dos columnas (datos y descripción / formulario). | M | No |
| F3 | Precio y plazas destacados (Playfair 1,3 rem en `--verde`); líneas continuas en vez de discontinuas. | S | No |
| F4 | Formulario dentro de una tarjeta `--crema-claro`; casillas con `accent-color` y 24 px. | S | No |
| F5 | «Condiciones de reserva y cancelación»: chevron SVG que gira y zona pulsable de 48 px. | S | No |

### 3.4 Menú (`src/layouts/Base.astro`)

| # | Propuesta | Tamaño | ¿Toca textos? |
|---|---|---|---|
| M1 | Menú de escritorio desde 960 px, enlaces con zona de 44-48 px y fuente 0,95 rem. | S | No |
| M2 | Hover con subrayado que crece desde el centro; página actual con línea fija `--verde`. | S | No |
| M3 | «Imparte tu Taller» separado con un separador fino. | S | No |
| M4 | Botón «Menú» de 48 px con icono ☰ que pasa a ✕. | S | No |
| M5 | Panel móvil a todo el ancho con fondo semitransparente; cierre al pulsar fuera, con `Esc` y al elegir enlace (mejora progresiva, sin JS sigue funcionando). | M | No |
| M6 | Cabecera que se compacta al hacer scroll, solo CSS dentro de `@supports`. | S | No |

### 3.5 Movimiento (skill `movimiento-web`)

Todo dentro de `@media (prefers-reduced-motion: no-preference)`, solo `transform` y `opacity`.

| # | Qué explica | Cómo | Tamaño |
|---|---|---|---|
| V1 | De la tarjeta a la ficha | View Transitions entre documentos y `view-transition-name` en la foto (350 ms). | S |
| V2 | Cambio de página | Fundido cruzado (250 ms); la cabecera no se mueve. | S |
| V3 | Aparición de secciones | `.aparece` con `animation-timeline: view()`, escalonado; visible por defecto. | S |
| V4 | Hover de tarjeta | `translateY(-4px)` y foto `scale(1.03)`; sombra por opacidad de pseudo-elemento. | S |
| V5 | Menú móvil | Entrada con `@starting-style`; icono ☰ → ✕. | S |
| V6 | `details` de condiciones | Chevron que gira; `::details-content` donde haya soporte. | S |
| V7 | Mariposa de portada (opcional) | Aparece una vez al cargar. | S |
| V8 | Corrección | `scroll-behavior: smooth` dentro de `prefers-reduced-motion: no-preference`. | S |

### 3.6 Resto de páginas (mismo sistema)

- **Clases**: píldoras en `--verde-oscuro` sobre `--salvia-suave`; foto a sangre; botones a ancho completo. S · No.
- **Bonos**: `accent-color: var(--verde)` global; tarjetas en arco salvia. S · No.
- **Privados y Colabora**: formulario en tarjeta, lectura a 640 px centrada desde 1000 px. S · No.
- **Espacio**: galería en mosaico con la primera foto en arco. S · No.
- **Pie**: sin franja crema tras sección salvia; email con `overflow-wrap: break-word`; cierre decorativo con la mariposa. S · No.

---

## 4. Tokens nuevos o cambiados (`src/styles/global.css`)

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--verde` | `#4a6f66` (igual) | Títulos y botones | crema 4,74 · crema-claro 5,23 · blanco encima 5,59 ✅ · salvia-suave 4,48 ❌ texto pequeño |
| `--verde-oscuro` | `#3b5952` (igual, uso nuevo) | Texto pequeño sobre `--salvia-suave` | 6,15 · crema 6,51 · crema-claro 7,18 ✅ |
| `--verde-profundo` | `#2f4a44` nuevo | Pie, panel de portada, foco | crema encima 8,16 ✅ |
| `--salvia` | `#8bb9ad` (igual, uso nuevo) | Superficie de marca, nunca texto | decorativo |
| `--oro` | `#9c7330` nuevo | Estrellas | crema 3,63 · crema-claro 4,00 ✅ |
| `--aviso` | `#a8553f` (igual) | «Completo» | crema-claro 4,87 ✅ · evitar sobre salvia-suave (4,17) |
| `--foco` | `= --verde-profundo` nuevo | `outline: 3px solid var(--foco)` | 8,16 frente a 1,85 ✅ |
| `--radio-arco` | `999px 999px var(--radio) var(--radio)` | Fotos en arco | n/a |
| `--duracion-corta` / `--duracion-media` | `160ms` / `350ms` | Movimiento | n/a |
| `--curva-salida` / `--curva-entrada` | `cubic-bezier(0.2,0.8,0.2,1)` / `cubic-bezier(0.4,0,1,1)` | Movimiento | n/a |

Tipografías sin cambios. Valorar si Playfair 600 se usa (23 KB menos si no).

---

## 5. Prioridades

| Orden | Bloque | Propuestas | Tamaño | Impacto |
|---|---|---|---|---|
| 1 | Accesibilidad y detalles visuales | tokens `--foco`, `--verde-oscuro`, `--oro`; `accent-color`; botón Menú 48 px; `nowrap` en horas; `text-wrap`; pie; V8 | S | Alto |
| 2 | Tarjetas de talleres | T1-T6, V4 | S | Alto |
| 3 | Portada | P1-P3, P5, P7 | S-M | Alto |
| 4 | Ficha de taller (móvil) | F1, F3-F5 | S | Alto en móvil |
| 5 | Movimiento entre páginas | V1-V3, T7 | S | Medio-alto |
| 6 | Menú | M1-M6, V5 | M | Medio |
| 7 | Ficha en escritorio | F2 | M | Medio |
| 8 | Logo optimizado | P4 | M | Medio |
| 9 | Resto de páginas | §3.6, V6-V7 | S cada una | Medio-bajo |

Sin datos nuevos para `constructor`. Las fotos reales siguen pendientes; el diseño funciona también con los huecos.

---

## 6. Resumen de «¿Toca textos?»

Ninguna propuesta de las secciones 3 a 5 cambia palabras, orden, puntuación ni mayúsculas, ni añade `text-transform`. P6 solo prepara el hueco.

---

## 7. Erratas y propuestas de texto para Iris

1. **`text-transform: uppercase` en `.etiqueta`** (`global.css:114`): en pantalla se lee «EVENTO ESPECIAL», «CLUB DE GANCHILLO»… aunque está escrito «Evento especial». Igual con `.mes__titulo { text-transform: capitalize }` (`talleres/index.astro:50`), que muestra «Octubre». ¿Cómo lo prefiere Iris?
2. **Acción principal en la portada** (P6): reutilizar «Ver calendario» (→ /talleres) y «Regalar un bono» (→ /bonos), o los que Iris prefiera.
3. **Mayúsculas del menú**: «Clases Semanales», «Talleres Privados», «Bonos Regalo», «El Espacio», «Imparte tu Taller» frente a los títulos con mayúscula solo inicial. ¿Unificar?
4. **«Nombre y apellido»** (ficha de taller): ¿«Nombre y apellidos»?
5. «de la mano de artesanas y artistas» (portada) frente a «con artesanas y artistas» (Talleres). ¿Unificar?
6. **Espacio**: el h1 dice «centro de Coruña» y el resto «A Coruña». ¿Intencionado?
7. **Lema de la portada**: dos frases algo largas en móvil; sugerencia opcional de dejar una.
8. **Ficha de taller**: ¿mostrar también «Antes de reservar» (`DetallesImportantes`) al final?

(Las reseñas de Google son citas literales: no se proponen cambios.)

---

## Capturas guardadas (49)

`docs/agentes/director-arte/capturas/2026-10-16-antes/`: página completa `<pagina>-{360,768,1280}.png` y primera pantalla `-pantalla` de inicio, talleres, taller-grabado-tote-bags, clases, privados, bonos, espacio y colabora; y `menu-movil-abierto-360.png`.
