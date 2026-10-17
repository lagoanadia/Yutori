// Copia los agentes y skills del kit (lagoanadia/kit-agents) a la carpeta .claude/ del proyecto.
//
// Por qué copiar: Claude Code lee .claude/agents y .claude/skills al arrancar CUALQUIER sesión (también en la nube),
// sin instalar nada ni pedir permisos. Un plugin, en cambio, hay que instalarlo antes de que arranque la sesión,
// y en las sesiones en la nube cada una empieza en una máquina limpia.
//
// Uso, desde la raíz del proyecto:   node scripts/actualizar-kit.mjs
//   - Lee .claude/kit.json (qué plugins copiar y de qué repositorio).
//   - Descarga el kit con git (hace falta acceso al repo privado) o usa KIT_DIR=<carpeta del kit> si ya está clonado.
//   - Borra lo que copió la vez anterior, copia la versión actual y apunta versiones y archivos en .claude/kit.json.
//   - Se copia también a sí mismo, para que el proyecto tenga siempre la última versión del script.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const raiz = process.cwd();
const rutaConfig = path.join(raiz, '.claude', 'kit.json');
if (!fs.existsSync(rutaConfig)) salir(`No encuentro ${rutaConfig}. Ejecuta el script desde la raíz del proyecto.`);
const config = JSON.parse(fs.readFileSync(rutaConfig, 'utf8'));

let origen = process.env.KIT_DIR;
let temporal;
if (!origen) {
  temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-agents-'));
  try {
    execFileSync('git', ['clone', '--quiet', '--depth', '1', config.repositorio, temporal], { stdio: 'inherit' });
  } catch {
    salir(`No he podido descargar ${config.repositorio}. En local: «gh auth login» y «gh auth setup-git». `
      + 'En una sesión en la nube: añade el repo kit-agents a la sesión.');
  }
  origen = temporal;
}

const anteriores = new Set(config.archivos ?? []);
const nuevos = [];
const versiones = {};

// Primero se calcula todo lo que se va a copiar, para no dejar el proyecto a medias si algo choca.
const copias = [];
for (const plugin of config.plugins) {
  const dirPlugin = path.join(origen, 'plugins', plugin);
  const manifiesto = path.join(dirPlugin, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifiesto)) salir(`El kit no tiene el plugin «${plugin}».`);
  const { version } = JSON.parse(fs.readFileSync(manifiesto, 'utf8'));
  versiones[plugin] = version;
  const marca = `# Copiado de kit-agents (${plugin} ${version}). No se edita aquí: se cambia en el kit y se vuelve a copiar.`;

  const dirAgentes = path.join(dirPlugin, 'agents');
  for (const archivo of listar(dirAgentes).filter((n) => n.endsWith('.md'))) {
    copias.push({ desde: path.join(dirAgentes, archivo), hasta: path.join('.claude', 'agents', archivo), marca });
  }
  const dirSkills = path.join(dirPlugin, 'skills');
  for (const skill of listar(dirSkills)) {
    copias.push({ desde: path.join(dirSkills, skill), hasta: path.join('.claude', 'skills', skill), marca });
  }
}

// Nunca se pisa un agente o skill propio del proyecto que se llame igual que uno del kit.
for (const { hasta } of copias) {
  if (fs.existsSync(path.join(raiz, hasta)) && !anteriores.has(hasta)) {
    salir(`${hasta} ya existe y no viene del kit. Renómbralo o bórralo antes de actualizar.`);
  }
}

for (const archivo of anteriores) fs.rmSync(path.join(raiz, archivo), { recursive: true, force: true });
for (const { desde, hasta, marca } of copias) {
  copiar(desde, path.join(raiz, hasta), marca);
  nuevos.push(hasta);
}
fs.mkdirSync(path.join(raiz, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(origen, 'scripts', 'actualizar-kit.mjs'), path.join(raiz, 'scripts', 'actualizar-kit.mjs'));

config.versiones = versiones;
config.actualizado = new Date().toISOString().slice(0, 10);
config.archivos = nuevos.sort();
fs.writeFileSync(rutaConfig, JSON.stringify(config, null, 2) + '\n');
if (temporal) fs.rmSync(temporal, { recursive: true, force: true });

console.log(`Kit copiado: ${Object.entries(versiones).map(([p, v]) => `${p} ${v}`).join(', ')}`);
const cuantos = (carpeta) => nuevos.filter((a) => a.startsWith(path.join('.claude', carpeta))).length;
console.log(`${cuantos('agents')} agentes y ${cuantos('skills')} skills en .claude/`);

function listar(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

/** Copia un archivo o carpeta. A los .md con cabecera (agentes y SKILL.md) les añade la marca de origen. */
function copiar(desde, hasta, marca) {
  if (fs.statSync(desde).isDirectory()) {
    fs.mkdirSync(hasta, { recursive: true });
    for (const hijo of fs.readdirSync(desde)) copiar(path.join(desde, hijo), path.join(hasta, hijo), marca);
    return;
  }
  fs.mkdirSync(path.dirname(hasta), { recursive: true });
  if (!desde.endsWith('.md')) return fs.copyFileSync(desde, hasta);
  const texto = fs.readFileSync(desde, 'utf8');
  // La marca va como comentario YAML dentro de la cabecera: fuera de ella, Claude Code no leería la cabecera.
  fs.writeFileSync(hasta, texto.startsWith('---\n') ? texto.replace('---\n', `---\n${marca}\n`) : texto);
}

function salir(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}
