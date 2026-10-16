# Yutori · memoria del proyecto

Web de **Yutori Espacio Creativo** (A Coruña): talleres mensuales impartidos por talleristas, clases semanales,
talleres privados y bonos regalo. Incluye un **panel** (ERP/CRM ligero) para Iris, la dueña.

Este archivo lo leen todos los agentes al empezar. Si cambias una convención, cámbiala aquí.

## Stack

- **Astro 7** con el adaptador de **Cloudflare** (Workers). Sin framework de UI: componentes `.astro` y CSS propio.
- **D1** (SQLite) en `env.DB`, con migraciones en `migrations/`. **R2** (`env.FOTOS`) para fotos.
- **Resend** para emails (`src/lib/email.ts`), **Google Calendar** (`src/lib/calendario.ts`),
  **Turnstile** antispam (`src/lib/turnstile.ts`), **Groq** para el asistente y la importación con IA del panel.
- Acceso al panel: Cloudflare Access (`src/lib/acceso.ts`) o contraseña `PANEL_CLAVE` (`src/lib/sesion.ts`). Lo decide `src/middleware.ts`.

## Mapa

```
src/pages/            Web pública (talleres, clases, privados, bonos, espacio, colabora, legales)
src/pages/panel/      Panel de Iris (protegido por el middleware)
src/pages/t/[codigo]  Enlace privado de cada tallerista para rellenar su taller
src/pages/reserva/[codigo]  Página privada de cada reserva
src/lib/              Lógica: db, reservas, clases, talleres, avisos (emails), importar, asistente…
src/components/       Componentes; los del panel en components/panel/
src/layouts/          Base.astro (web pública) y Panel.astro
src/data/yutori.ts    Datos y textos del negocio (los TODO son datos de ejemplo)
src/styles/global.css Tokens de diseño (colores, tipografías) y clases comunes
migrations/           SQL numerado 0001_, 0002_… (nunca se edita una migración ya aplicada)
docs/                 Specs (docs/specs/), planes (docs/planes/) e informes de los agentes (docs/agentes/<agente>/)
```

## Convenciones (obligatorias)

- **Todo en español**: nombres de variables, funciones, tablas, columnas, clases CSS y commits.
- **Dinero en céntimos** (`INTEGER`, columnas `*_cent`). Para mostrarlo, `euros()` o `eurosCorto()` de `src/lib/db.ts`.
- **Fechas** en texto ISO: día `AAAA-MM-DD`; momento `AAAA-MM-DDTHH:MM:SS` en UTC (`strftime(... 'now')`).
  Se muestran en hora de España con `fecha()`. "Hoy" es `hoyEspana()`.
- **SQL siempre con parámetros** (`?1`, `?2` + `.bind()` o los helpers `todos()` / `uno()`). Nunca interpolar datos del usuario.
- **Estados** como texto con `CHECK (estado IN (...))` en la tabla y su etiqueta legible en `src/lib/db.ts` (`ESTADOS_*`).
- **Plazas**: comprobar y reservar en **una sola sentencia** (`INSERT ... SELECT ... WHERE plazas - ocupadas >= ?`), como en
  `reservarTaller()`. Nunca "leer plazas y luego insertar" en dos pasos.
- **Formularios públicos**: ver la skill `astro-cloudflare:formulario-publico` (trampa `web`, Turnstile, privacidad con fecha,
  redirección 303). Ejemplo de referencia: `src/pages/bonos.astro`.
- **Emails**: siempre en `src/lib/avisos.ts` con `enviar()` (skill `astro-cloudflare:emails-transaccionales`). Voz de Yutori ("te escribimos"), nunca "Iris" en tercera persona.
  Un fallo de email jamás rompe una reserva.
- **Páginas con servidor**: `export const prerender = false;`. Las demás son estáticas.
- **Accesibilidad**: etiquetas `<label for>`, `role="alert"` en errores, `aria-current` en menús, objetivos táctiles de 48 px.
- **Comentarios**: breves, en español, explican el *porqué*. Las funciones exportadas llevan `/** ... */` de una línea.
- **Commits**: en español, en presente, y explican el porqué ("Bonos: «Para quién es» obligatorio").

## Comandos

```
npm run dev                  # o: astro dev --background (y astro dev stop / status / logs)
npm run build
npx astro check              # tipos y errores de Astro: pásalo antes de cada commit
npm run db:migrar:local      # aplica migraciones a la D1 local
npm run db:ejemplo           # datos de ejemplo en local
```

## Trabajo con agentes

Los agentes y skills genéricos vienen del catálogo **kit-agents** (repo `lagoanadia/kit-agents`), declarado en
`.claude/settings.json`: plugin `equipo-base` (agentes) y plugin `astro-cloudflare` (skills del stack).
No se copian aquí: se mejoran en el kit y se actualizan con `/plugin marketplace update kit-agents`.
Las skills que solo sirven para Yutori van en `.claude/skills/` de este repo.

Reglas:
1. Cada bloque de trabajo va en **su propia rama** y termina en un PR.
2. Los agentes de solo lectura devuelven su documento y **la sesión principal lo guarda** con nombre `AAAA-MM-DD-<tema>.md`:
   `producto` → `docs/specs/`, `arquitecto` → `docs/planes/`,
   `revisor`, `seguridad`, `auditor-web` y `director-arte` → `docs/agentes/<agente>/`.
3. Antes de construir algo grande, debe existir una spec en `docs/specs/` y un plan en `docs/planes/` aprobados por la usuaria.
4. Si un patrón se repite, `herrero-skills` puede proponer una skill nueva, siempre en un PR aparte.

## Documentación de Astro

https://docs.astro.build — rutas: /en/guides/routing/ · componentes: /en/basics/astro-components/ ·
estilos: /en/guides/styling/ · contenido: /en/guides/content-collections/ · Cloudflare: /en/guides/integrations-guide/cloudflare/
