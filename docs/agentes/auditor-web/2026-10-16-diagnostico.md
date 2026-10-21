# Auditoría web de Yutori: accesibilidad, SEO técnico y rendimiento

Fecha: 2026-10-16. Auditor: `auditor-web`. Alcance: 14 páginas públicas (más una URL inexistente para el 404 real), `robots.txt`, `sitemap.xml`, `public/_headers`, `src/layouts/Base.astro`, `src/styles/global.css` y las fuentes @fontsource.

Cómo se midió: Playwright con Chromium a 360 px (y 320 px para el reflow); pesos con `npm run build` + `astro preview`; axe-core 4.10.2 (instalado solo en una carpeta temporal); contrastes calculados con los tokens reales. No se modificó ningún archivo del repositorio.

## Resumen

**Lo bueno, medido**
- Un único `h1` por página, `lang="es"`, los 4 landmarks y «Saltar al contenido».
- Sin scroll horizontal a 360 ni a 320 px.
- Todos los campos con `label` o `fieldset`/`legend`; errores en `role="alert"`; `autocomplete` correctos.
- 0 KB de JavaScript en las páginas públicas (solo dos scripts inline pequeños y Turnstile si está activo).
- Fuentes propias (5 `woff2`, 96,8 KB) con `font-display: swap`; CSS de 14,8 KB.
- Páginas de 340-350 KB sin comprimir, de los que 222 KB son el logo. `og.jpg` 1200×630, 66 KB.
- axe-core sin violaciones en 6 de 14 páginas.

**Lo que hay que arreglar**
- 🔴 `/logo.svg` pesa 222 KB (65 % de cada página). Gzip lo deja en 79 KB.
- 🔴 El anillo de foco no cumple 1.4.11: `--salvia` da 1,85:1 sobre crema y 2,18:1 sobre blanco (mínimo 3:1).
- 🔴 (al publicar) Falta el SEO de indexación: sin JSON-LD, sitemap con URLs con y sin barra final, `indexar=false`.
- 🟡 Contraste 4,47:1 en 6 páginas: `--verde` sobre `--salvia-suave` (`.foto-hueco`, `.etiqueta`, `.temas li`, «Ver todo el calendario →»).
- 🟡 Objetivos táctiles por debajo de 48 px en las 14 páginas (botón «Menú» 47 px, pie 23-27 px, casillas 20 px…). Ninguno baja de 24 px salvo los de 23 px del pie.
- 🟡 6 páginas indexables (más el 404) comparten la meta description por defecto.

## Los 5 cambios con más impacto

| # | Cambio | Área | Tamaño | ¿Toca textos? |
|---|---|---|---|---|
| 1 | Aligerar `/logo.svg` (222 KB → 15-30 KB) y cachearlo | Rendimiento | M | no |
| 2 | Anillo de foco con un token de 3:1 o más (por ejemplo `--verde`) | Accesibilidad | S | no |
| 3 | JSON-LD `LocalBusiness` en `Base.astro` y `Event` en `/talleres/[slug]` | SEO | M | no |
| 4 | Oscurecer el texto verde sobre `--salvia-suave` y el borde de los campos | Accesibilidad | S | no |
| 5 | Objetivos táctiles de 48 px: menú, pie y casillas | Accesibilidad | S/M | no |

## Hallazgos por área

### Accesibilidad (WCAG 2.2 AA)

| Sev. | Dónde | Hallazgo y dato medido | Arreglo | Tam. | ¿Toca textos? |
|---|---|---|---|---|---|
| 🔴 | `src/styles/global.css:159-161` | Foco en `--salvia`: 1,85:1 sobre crema, 2,18:1 sobre blanco, 1,5:1 sobre salvia-suave. Incumple 1.4.11. | Usar `--verde` (4,74 / 5,59) y ampliarlo a `summary:focus-visible` y `.boton-texto:focus-visible`. | S | no |
| 🟡 | `global.css:109-121` (`.etiqueta`), `:132-143` (`.foto-hueco`), `clases.astro:105` (`.temas li`), «Ver todo el calendario →» | `--verde` sobre `--salvia-suave` 4,47:1 en texto pequeño. Nodos: 6 en `/`, 4 en `/talleres`, 1 en la ficha, 17 en `/clases`, 3 en `/espacio`. | `--verde-oscuro` en esos textos o aclarar `--salvia-suave`. | S | no |
| 🟡 | `global.css:150-157` | Borde de campos `--borde` 1,55:1 sobre blanco (1.4.11 pide 3:1). | Borde en `--tinta-suave`. | S | no |
| 🟡 | `global.css:163-166` y formularios | Casillas y radios de 20×20 px, etiqueta de 27 px de alto. | `min-height: 48px` y `padding-block` en `.casilla`. | S | no |
| 🟡 | `Base.astro:75`, `:140-148` | Botón «Menú» 84×47 px. | `min-height: 48px`. | S | no |
| 🟡 | Pie de `Base.astro` y enlaces sueltos | Enlaces del pie de 23 px (fallan 2.5.8, 24 px) y de contacto de 27 px; enlaces sueltos de 23-27 px. | `min-height: 48px` con `padding-block` / `inline-flex`. | S | no |
| 🟡 | `global.css:24` | `scroll-behavior: smooth` sin respetar `prefers-reduced-motion`. | Moverlo dentro de la media query. | S | no |
| 🟡 | `TextoLegal.astro:20-21` | A < 700 px la tabla pasa a `display:block` con scroll: no enfocable y pierde la semántica. | Contenedor `role="region" tabindex="0"` con scroll; tabla en `display:table`. | M | no (el `aria-label` necesitaría texto de Iris si no vale uno genérico) |
| 🟡 | `clases.astro:47-50` | El `h3` «Adultos» + `<span>` sin espacio: nombre accesible «Adultos55 €/mes…». | Insertar `{' '}` (visualmente igual). | S | no |
| 🟡 | `Resenas.astro:16` | `aria-label` en un `span` sin rol. | `role="img"`. | S | no |
| 🟡 | Formularios `/privados:68`, `/bonos:90`, `/clases/pedir-plaza:84`, `/talleres/[slug]:88`, `/colabora:87` | Los errores en `role="alert"` en el HTML inicial no siempre se anuncian; sin `aria-invalid`/`aria-describedby`. | Llevar el foco al bloque de errores; opcional `aria-invalid`. | M | no |
| 🔵 | `Base.astro:75` | El menú móvil no se cierra con Escape. | Script de 3 líneas o dejarlo. | S | no |
| 🔵 | `TallerCard.astro:13`, `[slug].astro:57` | `alt` «Taller ${titulo}», redundante. | Alt descriptivo: necesita texto de Iris. | S | sí |
| 🔵 | `Resenas.astro` | Título en Parisienne a 2,4 rem en un `h2`. | Revisión visual, no es incumplimiento. | S | no |

### SEO técnico

| Sev. | Dónde | Hallazgo | Arreglo | Tam. | ¿Toca textos? |
|---|---|---|---|---|---|
| 🔴 (al publicar) | `src/data/yutori.ts` (`indexar: false`), `Base.astro:42-44`, `robots.txt.ts` | Hoy todo `noindex, nofollow`, sin canonical, `Disallow: /`. Correcto para prototipo. | Checklist de publicación. | S | no |
| 🔴 (al publicar) | Todas | 0 bloques JSON-LD. | `LocalBusiness` (faltan teléfono, `geo` y horario: datos de Iris) y `Event` en la ficha (`SoldOut` si no quedan plazas). No marcar reseñas propias como `AggregateRating`. | M | no |
| 🟡 | `sitemap.xml.ts:7` | Mezcla URLs con y sin barra final. | Un solo criterio. | S | no |
| 🟡 | `Base.astro:44` y servidor | Estáticas responden 307 a la versión con barra; dinámicas 200 con y sin barra → canónicos duplicados. | Fijar `trailingSlash` y normalizar enlaces y canónico. | M | no |
| 🟡 | `Base.astro:19` | Descripción por defecto repetida en 6 páginas + 404. | Propuesta para Iris. | S | sí |
| 🟡 | `/clases/pedir-plaza` | Paso de formulario con título igual para todas las clases. | `noindex`. | S | no |
| 🟡 | `/404` | Se sirve con 200 en `/404` (`/no-existe` sí da 404). | Inofensivo con `noindex`; comprobar en el hosting real. | S | no |
| 🔵 | `Base.astro:46-54` | Faltan `og:url` y `og:image:alt`. | `og:url` = canonical; el alt necesita texto de Iris. | S | sí (alt) |
| 🔵 | `Base.astro:40` | Sin `apple-touch-icon` ni PNG de respaldo. | PNG de 180 y 48 px. | S | no |
| 🔵 | `robots.txt.ts` | No bloquea `/panel` sin barra. | `Disallow: /panel`. | S | no |
| 🔵 | `sitemap.xml.ts` | Sin `lastmod`; consulta D1 en cada visita. | `lastmod` y `Cache-Control`. | S | no |

### Rendimiento

| Sev. | Dónde | Hallazgo | Arreglo | Tam. | ¿Toca textos? |
|---|---|---|---|---|---|
| 🔴 | `public/logo.svg` (`Mariposa.astro:6`) | 222.332 bytes (79.368 gzip), 65 % de cada página; viewBox 2372×1834 pintado a 64 y 150 px; dos veces en portada. | SVGO o WebP/AVIF de 300 px. Objetivo < 30 KB. | M | no |
| 🟡 | `public/_headers` | `/logo.svg`, `/favicon.svg` y `/og.jpg` con `max-age=0`. | Caché de una semana o mover el logo a `src/assets`. | S | no |
| 🟡 | `src/lib/fotos.ts:8-30`, `imageService: 'passthrough'` | Fotos de R2 de hasta 5 MB sin redimensionar (no medible: no hay fotos de ejemplo). | Redimensionar al subir o servir con Cloudflare Images; `width`/`height`. | M | no |
| 🟡 | `TallerCard.astro:13` | `loading="lazy"` también en la primera pantalla; sin `width`/`height`. | Quitar `lazy` a la primera. | S | no |
| 🟡 | `[slug].astro:57` | La foto principal (LCP) sin `fetchpriority` ni dimensiones. | Añadirlos. | S | no |
| 🔵 | `Base.astro:2-6` | 5 `woff2` por página; los `@font-face` de subsets no usados ocupan ~5,5 KB del CSS; sin `preload`. | Importar solo latin y precargar Playfair 700 y Nunito 400. | S | no |
| 🔵 | `--serif` | Playfair 600 solo se usa por falta del 400. | Decisión de diseño (23 KB). | S | no |
| 🔵 | Páginas dinámicas | Consulta D1 en cada visita; TTFB local 12-21 ms. | `s-maxage=60` en `/`, `/talleres`, `/clases` si crece el tráfico. | S | no |

## Medidas

### Peso por página (bytes sin comprimir)

| Página | HTML | CSS | Fuentes | Imágenes | JS | Total |
|---|---|---|---|---|---|---|
| `/` | 15.838 | 14.834 | 96.780 | 222.597 | 0 | 350.049 |
| `/talleres` | 12.667 | 14.834 | 96.780 | 222.597 | 0 | 346.878 |
| `/talleres/grabado-tote-bags` | 9.968 | 14.834 | 96.780 | 222.597 | 0 | 344.179 |
| `/clases` | 15.629 | 14.834 | 96.780 | 222.597 | 0 | 349.840 |
| `/clases/pedir-plaza?clase=ganchillo` | 10.289 | 14.834 | 96.780 | 222.597 | 0 (1 inline) | 344.500 |
| `/privados` | 9.726 | 14.834 | 96.780 | 222.597 | 0 | 343.937 |
| `/bonos` | 10.611 | 14.834 | 96.780 | 222.597 | 0 (1 inline) | 344.822 |
| `/espacio` | 6.148 | 14.833 | 96.780 | 222.597 | 0 | 340.358 |
| `/colabora` | 9.804 | 14.834 | 96.780 | 222.597 | 0 | 344.015 |
| `/aviso-legal` | 7.862 | 14.833 | 96.780 | 222.597 | 0 | 342.072 |
| `/condiciones` | 6.844 | 14.833 | 96.780 | 222.597 | 0 | 341.054 |
| `/cookies` | 7.131 | 14.833 | 96.780 | 222.597 | 0 | 341.341 |
| `/privacidad` | 9.630 | 14.833 | 96.780 | 222.597 | 0 | 343.840 |
| `/404` | 5.296 | 14.833 | 96.780 | 222.597 | 0 | 339.506 |

Sin el logo, cada página bajaría a unos 118-128 KB.

### Fuentes

| Familia | Pesos | Bytes |
|---|---|---|
| Playfair Display | 600 y 700 | 23.228 + 23.224 |
| Nunito Sans | 400 y 700 | 13.892 + 13.836 |
| Parisienne | 400 | 22.600 |
| **Total** | 5 ficheros | **96.780** |

### Contrastes

| Pareja | Ratio | Resultado |
|---|---|---|
| `--tinta` sobre crema / crema-claro / salvia-suave | 11,21 / 12,36 / 10,58 | Pasa |
| `--tinta-suave` sobre crema / crema-claro / salvia-suave | 5,46 / 6,02 / 5,15 | Pasa |
| `--verde` sobre crema / crema-claro / blanco | 4,74 / 5,23 / 5,59 | Pasa |
| **`--verde` sobre `--salvia-suave`** | **4,47-4,48** | **Falla (texto pequeño)** |
| Blanco sobre `--verde` / `--verde-oscuro` | 5,59 / 7,67 | Pasa |
| `#f6f1e4` sobre `--verde` (pie) | 4,96 | Pasa |
| `--aviso` sobre crema-claro / blanco | 4,87 / 5,20 | Pasa |
| **`--aviso` sobre crema / fondo de errores** | **4,42 / 4,43** | Falla latente (hoy no se usa así) |
| **Foco `--salvia` sobre crema / blanco** | **1,85 / 2,18** | **Falla 1.4.11** |
| **Borde de campo sobre blanco** | **1,55** | **Falla 1.4.11** |

### Objetivos táctiles a 360 px (< 48 px)

| Elemento | Medida | Páginas |
|---|---|---|
| `summary` «Menú» | 84×47 | todas |
| Enlaces del pie (legales) | 23 de alto | todas |
| Contacto del pie | 27 de alto | todas |
| «Ver todo el calendario →» | 187×27 | `/` |
| «Pide un taller privado», «Leer la política completa →» | 23 | `/talleres` |
| «← Todos los talleres», `summary` de condiciones | 23 / 27 | ficha |
| Casillas y radios | 20×20 (etiqueta 27) | 5 formularios |
| «política de privacidad» | 161×23 | formularios |

## Erratas y propuestas para Iris

**Títulos y descripciones (cuentan como texto)**
- Descripciones duplicadas en `/clases/pedir-plaza`, `/aviso-legal`, `/condiciones`, `/cookies`, `/privacidad` y 404. Propuestas de ejemplo: «Reserva tu plaza en una clase semanal de Yutori Espacio Creativo, en A Coruña.», «Datos del titular y condiciones de uso de la web de Yutori Espacio Creativo.», «Cómo cancelar o ceder tu plaza en los talleres y las clases de Yutori Espacio Creativo.», «Qué cookies usa la web de Yutori Espacio Creativo: ninguna de publicidad ni de seguimiento.», «Qué datos guardamos, para qué y cómo ejercer tus derechos en la web de Yutori Espacio Creativo.».
- Título de `/clases/pedir-plaza`: «Reservar plaza · Yutori Espacio Creativo» no dice qué clase es.

**Textos visibles**
- `/espacio`: «…en el centro de Coruña» frente a «A Coruña» en el resto. ¿Intencionado?
- Días de la semana con mayúscula en medio de frase («Cuándo: Sábado 17…», «Octubre, Lunes 18:00-19:30h»). Los generan `DIAS` (`src/lib/db.ts:57`) y `fechaLarga` (`src/data/yutori.ts:191`).
- Formato de hora distinto según la página: «18:00-19:30», «18:00-19:30h», «de 10:30 a 13:00», «10:30-13:00».
- `privacidad.astro:48`: `"en reserva"` con comillas rectas en vez de «».
- Dirección «Plaza Pontevedra 14, 1-1º-B2»: ¿es «1º-B2»?
- Reseña «taller de creación joyas»: cita literal; solo informativo.
- Legales con «[pendiente]» y «Borrador»: bloquea la publicación (LSSI).

**Textos nuevos que necesita Iris**
- `alt` de cada foto de taller y del espacio.
- `og:image:alt`.
- Teléfono y horario para el JSON-LD.
- `aria-label` de las tablas desplazables de `/cookies` y `/privacidad`.
