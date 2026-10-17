---
# Copiado de kit-agents (equipo-base 1.1.0). No se edita aquí: se cambia en el kit y se vuelve a copiar.
name: capturas-pantalla
description: Arranca la web en local y hace capturas con Playwright a tamaño móvil, tablet y escritorio para VER cómo queda una interfaz. Úsala antes y después de cualquier cambio visual, o cuando haya que revisar el aspecto real de una página.
---

# Capturas de pantalla de la web

Claude puede **ver imágenes**: una captura convierte «creo que queda bien» en «lo he comprobado».

## 1. Arranca la web en local

- Usa el comando de desarrollo que indique el `CLAUDE.md` del proyecto (en Astro: `astro dev --background`,
  o `npm run dev` en segundo plano).
- Espera a que responda antes de capturar:
  ```bash
  for i in $(seq 1 30); do curl -sf http://localhost:4321 >/dev/null && break; sleep 1; done
  ```
- Si la página necesita datos (base de datos local, datos de ejemplo), prepáralos según el `CLAUDE.md`.
- **Astro** muestra abajo una barra de herramientas de desarrollo que no forma parte de la web.
  Desactívala antes de capturar con `npx astro preferences disable devToolbar` (es una preferencia local; no cambia el proyecto)
  o, como mínimo, no la tengas en cuenta al revisar.

## 2. Captura en los tres tamaños

```bash
URL=http://localhost:4321/ruta
DIR=<carpeta temporal>   # nunca dentro del repo, salvo las capturas finales
npx playwright screenshot --viewport-size=360,800   --full-page "$URL" "$DIR/movil.png"
npx playwright screenshot --viewport-size=768,1024  --full-page "$URL" "$DIR/tablet.png"
npx playwright screenshot --viewport-size=1280,800  --full-page "$URL" "$DIR/escritorio.png"
```

- **Sin `--full-page`**: captura solo la primera pantalla, lo que se ve sin hacer scroll. Revísala aparte:
  es lo más importante.
- `--wait-for-timeout=1500`: espera a que terminen las animaciones de entrada.
- `--color-scheme=dark`: comprueba el modo oscuro si la web lo tiene.

Luego **abre cada imagen con la herramienta de lectura de archivos y mírala**.

## 3. Estados que una captura simple no ve

Para el hover, un menú abierto, un formulario con errores o el modo «reducir movimiento»,
usa un script pequeño con la API de Playwright (en una carpeta temporal, fuera del repo):

```js
// capturar-estado.mjs  →  node capturar-estado.mjs
import { chromium } from 'playwright';
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 360, height: 800 } });
await pagina.emulateMedia({ reducedMotion: 'reduce' }); // comprueba que sin movimiento todo se ve
await pagina.goto('http://localhost:4321/');
await pagina.click('summary');                          // por ejemplo, abrir el menú móvil
await pagina.screenshot({ path: 'menu-abierto.png' });
await navegador.close();
```

## 4. Si Playwright no está disponible

- **En tu ordenador**: instala el navegador una vez con `npx playwright install chromium`.
- **En sesiones de Claude Code en la nube**: Chromium ya viene instalado. No ejecutes `playwright install`.

## 5. Al terminar

- Para el servidor de desarrollo (`astro dev stop` o el proceso que arrancaste).
- Solo las capturas finales **antes y después** se guardan en el repo (en la carpeta que indique el agente).
  Las intermedias se borran.
