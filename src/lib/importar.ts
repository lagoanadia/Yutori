// Importación de datos desde CSV al panel: valida cada fila, descarta las repetidas y guarda todo en una sola transacción.
import { db, todos, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA } from './db';
import { normalizar, parsearCsv, type Fila } from './csv';
import { esEmail, esFecha } from './util';

export type Tipo = 'talleristas' | 'solicitudes';

export const TIPOS_IMPORTAR: Record<Tipo, string> = { talleristas: 'Talleristas', solicitudes: 'Privados y bonos' };
const TIPOS_SOLICITUD: Record<string, string> = { privado: 'Privado', bono: 'Bono regalo' };
const TIPOS_BONO: Record<string, string> = { taller: 'Taller', importe: 'Importe' };

export const MAX_BYTES = 1_000_000; // 1 MB
export const MAX_FILAS = 500;

/** Una fila ya validada: `datos` son las columnas de la tabla y `vista` lo que se enseña en la vista previa. */
export type Filas = { datos: Record<string, unknown>; vista: string[] };

export type Preparado = {
  cabecera: string[];
  validas: Filas[];
  errores: string[];   // una por fila incorrecta: "Fila 4: …"
  repetidas: number;   // filas que ya existían (mismo nombre y email): se saltan, no es un error
};

/** "sí"/"no"/"1"/"0" → 1 o 0. Vacío → null. Otra cosa → error. */
function siNo(valor: string, campo: string, errores: string[]): number | null {
  if (!valor) return null;
  const v = normalizar(valor);
  if (['si', 's', '1', 'true'].includes(v)) return 1;
  if (['no', 'n', '0', 'false'].includes(v)) return 0;
  errores.push(`«${campo}» tiene que ser sí o no (has escrito «${valor}»)`);
  return null;
}

/** Busca un código (p. ej. "aceptada") aceptando también su nombre visible ("Aceptada"). */
function codigoDe(texto: string, opciones: Record<string, string>) {
  const t = normalizar(texto);
  return Object.keys(opciones).find((k) => k === t || normalizar(opciones[k]) === t) ?? null;
}

/** Acepta 2025-03-14 y 14/03/2025, y devuelve siempre 2025-03-14. */
function fechaDe(valor: string, campo: string, errores: string[]): string | null {
  const barras = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  const iso = barras ? `${barras[3]}-${barras[2]}-${barras[1]}` : valor;
  if (esFecha(iso)) return iso;
  errores.push(`«${campo}» no es una fecha válida (usa AAAA-MM-DD o DD/MM/AAAA)`);
  return null;
}

type Mapeo = { datos: Record<string, unknown> | null; vista: string[]; errores: string[] };

function mapearTallerista(f: Fila, categorias: Map<string, number>): Mapeo {
  const e: string[] = [];
  for (const campo of ['nombre', 'email', 'propuesta']) if (!f[campo]) e.push(`falta «${campo}»`);
  if (f.email && !esEmail(f.email)) e.push(`el email «${f.email}» no es válido`);

  const categoriaId = f.categoria ? categorias.get(normalizar(f.categoria)) ?? null : null;
  if (f.categoria && categoriaId === null) e.push(`la categoría «${f.categoria}» no existe en el panel`);

  const estado = f.estado ? codigoDe(f.estado, ESTADOS_TALLERISTA) : 'nueva';
  if (!estado) e.push(`el estado «${f.estado}» no vale (usa: ${Object.values(ESTADOS_TALLERISTA).join(', ')})`);

  const haImpartido = siNo(f.ha_impartido ?? '', 'ha_impartido', e);
  const autonoma = siNo(f.autonoma ?? '', 'autonoma', e);

  const datos = {
    nombre: f.nombre, marca: f.marca || null, instagram: f.instagram || null, email: f.email,
    telefono: f.telefono || null, categoria_id: categoriaId, propuesta: f.propuesta,
    ha_impartido: haImpartido, autonoma, estado,
  };
  return {
    datos: e.length ? null : datos,
    vista: [f.nombre, f.email, f.categoria ?? '—', ESTADOS_TALLERISTA[estado ?? ''] ?? '—'],
    errores: e,
  };
}

function mapearSolicitud(f: Fila, categorias: Map<string, number>): Mapeo {
  const e: string[] = [];
  for (const campo of ['nombre', 'email']) if (!f[campo]) e.push(`falta «${campo}»`);
  if (f.email && !esEmail(f.email)) e.push(`el email «${f.email}» no es válido`);

  const tipo = codigoDe(f.tipo ?? '', TIPOS_SOLICITUD);
  if (!tipo) e.push(`el tipo «${f.tipo ?? ''}» no vale (usa: privado o bono)`);

  const tipoBono = f.tipo_bono ? codigoDe(f.tipo_bono, TIPOS_BONO) : null;
  if (f.tipo_bono && !tipoBono) e.push(`el tipo de bono «${f.tipo_bono}» no vale (usa: taller o importe)`);
  if (tipo === 'bono' && !tipoBono) e.push('un bono necesita «tipo_bono» (taller o importe)');

  const categoriaId = f.categoria ? categorias.get(normalizar(f.categoria)) ?? null : null;
  if (f.categoria && categoriaId === null) e.push(`la categoría «${f.categoria}» no existe en el panel`);

  const estado = f.estado ? codigoDe(f.estado, ESTADOS_SOLICITUD) : 'nueva';
  if (!estado) e.push(`el estado «${f.estado}» no vale (usa: ${Object.values(ESTADOS_SOLICITUD).join(', ')})`);

  const fechaAprox = f.fecha_aprox ? fechaDe(f.fecha_aprox, 'fecha_aprox', e) : null;
  const personas = f.personas ? Number(f.personas) : null;
  if (personas !== null && (!Number.isInteger(personas) || personas < 1)) e.push(`«personas» tiene que ser un número entero (has escrito «${f.personas}»)`);

  const datos = {
    tipo, nombre: f.nombre, email: f.email, telefono: f.telefono || null, motivo: f.motivo || null,
    categoria_id: categoriaId, fecha_aprox: fechaAprox, personas, tipo_bono: tipoBono,
    detalle: f.detalle || null, para_quien: f.para_quien || null, mensaje: f.mensaje || null, estado,
  };
  return {
    datos: e.length ? null : datos,
    vista: [TIPOS_SOLICITUD[tipo ?? ''] ?? '—', f.nombre, f.email, f.categoria ?? '—', ESTADOS_SOLICITUD[estado ?? ''] ?? '—'],
    errores: e,
  };
}

/** Lee el texto del CSV, valida cada fila y avisa de las que ya existen en la base. No guarda nada. */
export async function preparar(tipo: Tipo, texto: string): Promise<Preparado> {
  const filas = parsearCsv(texto);
  const categorias = new Map(
    (await todos<{ id: number; nombre: string }>('SELECT id, nombre FROM categorias')).map((c) => [normalizar(c.nombre), c.id]),
  );
  // Clave para detectar repetidas: mismo nombre y mismo email (sin mayúsculas ni acentos).
  const clave = (nombre: string, email: string) => `${normalizar(email)}|${normalizar(nombre)}`;
  const vistas = new Set(
    (await todos<{ nombre: string; email: string }>(`SELECT nombre, email FROM ${tipo}`)).map((r) => clave(r.nombre, r.email)),
  );

  const cabecera = tipo === 'talleristas'
    ? ['Nombre', 'Email', 'Categoría', 'Estado']
    : ['Tipo', 'Nombre', 'Email', 'Categoría', 'Estado'];
  const preparado: Preparado = { cabecera, validas: [], errores: [], repetidas: 0 };

  filas.forEach((f, i) => {
    const linea = i + 2; // la cabecera es la línea 1
    if (!f.nombre && !f.email) return;
    const mapeo = tipo === 'talleristas' ? mapearTallerista(f, categorias) : mapearSolicitud(f, categorias);
    if (mapeo.errores.length) {
      preparado.errores.push(`Fila ${linea}: ${mapeo.errores.join('; ')}`);
      return;
    }
    const k = clave(f.nombre, f.email);
    if (vistas.has(k)) { preparado.repetidas++; return; }
    vistas.add(k); // así también se detectan repetidas dentro del mismo archivo
    preparado.validas.push({ datos: mapeo.datos!, vista: mapeo.vista });
  });
  return preparado;
}

/** Guarda las filas válidas. D1 ejecuta el lote entero como una transacción: o entran todas o ninguna. */
export async function importar(tipo: Tipo, filas: Filas[]) {
  const sentencias = filas.map(({ datos }) => {
    const columnas = Object.keys(datos);
    const marcas = columnas.map((_, i) => `?${i + 1}`).join(', ');
    return db()
      .prepare(`INSERT INTO ${tipo} (${columnas.join(', ')}) VALUES (${marcas})`)
      .bind(...Object.values(datos));
  });
  if (sentencias.length) await db().batch(sentencias);
  return sentencias.length;
}
