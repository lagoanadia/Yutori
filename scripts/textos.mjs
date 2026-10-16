// Red de seguridad para los textos de la web (los aprobó Iris y no se cambian).
// Abre cada página con Playwright, saca el texto visible (innerText) y lo guarda o lo compara.
//
//   node scripts/textos.mjs guardar   → escribe docs/agentes/textos-antes/<página>.txt
//   node scripts/textos.mjs comparar  → vuelve a extraer y lo compara con esos archivos (sale con error si cambia algo)
//
// Necesita la web en local con los datos de ejemplo (npm run db:migrar:local, npm run db:ejemplo, astro dev).
// Otra dirección: TEXTOS_URL=http://localhost:4322 node scripts/textos.mjs comparar
// Otra carpeta de referencia: TEXTOS_DIR=ruta node scripts/textos.mjs guardar
//
// Los saltos de línea y espacios no cuentan (dependen de la maquetación): se comparan las palabras en orden,
// con su puntuación y sus mayúsculas tal como se ven en pantalla.
// Ojo: algunas páginas dependen de la fecha de hoy (próximos talleres, calendario del mes). Si la referencia
// es de otro día, vuelve a guardarla desde main el mismo día antes de comparar.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.TEXTOS_URL ?? 'http://localhost:4321';
const DIR = process.env.TEXTOS_DIR ?? 'docs/agentes/textos-antes';
const NAVEGADOR = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Web pública y enlaces privados (con los códigos de scripts/ejemplo-local.sql).
const PUBLICAS = {
  'inicio': '/',
  'talleres': '/talleres',
  'taller-ficha': '/talleres/grabado-tote-bags',
  'clases': '/clases',
  'clases-pedir-plaza': '/clases/pedir-plaza?clase=ganchillo',
  'privados': '/privados',
  'bonos': '/bonos',
  'espacio': '/espacio',
  'colabora': '/colabora',
  'aviso-legal': '/aviso-legal',
  'condiciones': '/condiciones',
  'cookies': '/cookies',
  'privacidad': '/privacidad',
  '404': '/404',
  't-tallerista': '/t/ejemplo-lucia-1-local-abc',
  'reserva-taller': '/reserva/ejemplo-reserva-taller-local-abc',
  'reserva-clase': '/reserva/ejemplo-reserva-clase-local-abc',
};

// Una página de cada tipo del panel.
const PANEL = {
  'panel-inicio': '/panel',
  'panel-entrar': '/panel/entrar',
  'panel-talleres': '/panel/talleres',
  'panel-taller': '/panel/talleres/1',
  'panel-taller-nuevo': '/panel/talleres/nuevo',
  'panel-talleristas': '/panel/talleristas',
  'panel-tallerista': '/panel/talleristas/1',
  'panel-tallerista-nueva': '/panel/talleristas/nueva',
  'panel-solicitudes': '/panel/solicitudes',
  'panel-solicitud': '/panel/solicitudes/1',
  'panel-solicitud-nueva': '/panel/solicitudes/nueva',
  'panel-reservas': '/panel/reservas',
  'panel-reserva': '/panel/reservas/1',
  'panel-clases': '/panel/clases',
  'panel-horario': '/panel/clases/horario',
  'panel-horario-grupo': '/panel/clases/horario/1',
  'panel-alumna': '/panel/clases/alumna',
  'panel-asistente': '/panel/asistente',
};

const PAGINAS = { ...PUBLICAS, ...PANEL };

/** Texto de la página: título, descripción y todo lo visible del cuerpo, sin líneas vacías. */
async function extraer(pagina, ruta) {
  const respuesta = await pagina.goto(BASE + ruta, { waitUntil: 'networkidle' });
  const estado = respuesta?.status() ?? 0;
  const texto = await pagina.evaluate(() => {
    const descripcion = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    return [`[título] ${document.title}`, `[descripción] ${descripcion}`, document.body.innerText].join('\n');
  });
  const limpio = texto.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  return { estado, texto: `[estado] ${estado}\n${limpio}\n` };
}

const palabras = (texto) => texto.split(/\s+/).filter(Boolean);

/** Diferencias palabra a palabra (subsecuencia común más larga). Devuelve trozos quitados y añadidos con contexto. */
function diferencias(antes, despues) {
  const a = palabras(antes);
  const b = palabras(despues);
  const n = a.length;
  const m = b.length;
  const tabla = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tabla[i][j] = a[i] === b[j] ? tabla[i + 1][j + 1] + 1 : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
    }
  }
  const cambios = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; continue; }
    const desde = i;
    const quitado = [];
    const anadido = [];
    while ((i < n || j < m) && !(i < n && j < m && a[i] === b[j])) {
      if (j < m && (i >= n || tabla[i][j + 1] >= tabla[i + 1][j])) anadido.push(b[j++]);
      else quitado.push(a[i++]);
    }
    const contexto = a.slice(Math.max(0, desde - 6), desde).join(' ');
    cambios.push({ contexto, quitado: quitado.join(' '), anadido: anadido.join(' ') });
  }
  return cambios;
}

const modo = process.argv[2];
if (modo !== 'guardar' && modo !== 'comparar') {
  console.error('Uso: node scripts/textos.mjs guardar | comparar');
  process.exit(2);
}

const navegador = await chromium.launch({ executablePath: NAVEGADOR });
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
let errores = 0;

try {
  if (modo === 'guardar') await mkdir(DIR, { recursive: true });
  for (const [nombre, ruta] of Object.entries(PAGINAS)) {
    const { estado, texto } = await extraer(pagina, ruta);
    const archivo = join(DIR, `${nombre}.txt`);
    if (modo === 'guardar') {
      await writeFile(archivo, texto);
      console.log(`${estado === 200 || nombre === '404' ? '✓' : '⚠'} ${nombre} (${estado}) ${ruta}`);
      continue;
    }
    if (!existsSync(archivo)) {
      console.log(`✗ ${nombre}: no hay referencia en ${archivo}`);
      errores++;
      continue;
    }
    const cambios = diferencias(await readFile(archivo, 'utf8'), texto);
    if (cambios.length === 0) {
      console.log(`✓ ${nombre}`);
      continue;
    }
    errores++;
    console.log(`✗ ${nombre} ${ruta}: ${cambios.length} diferencia(s)`);
    for (const c of cambios) {
      console.log(`    …${c.contexto}`);
      if (c.quitado) console.log(`    - ${c.quitado}`);
      if (c.anadido) console.log(`    + ${c.anadido}`);
    }
  }
} finally {
  await navegador.close();
}

if (modo === 'comparar') {
  console.log(errores ? `\n${errores} página(s) con textos distintos. Cualquier diferencia es un error.` : '\nTextos idénticos en todas las páginas.');
  process.exit(errores ? 1 : 0);
}
