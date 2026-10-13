// Importación de datos al panel: separa el texto pegado (con la IA si hace falta), valida cada fila,
// descarta las repetidas y guarda todo en una sola transacción.
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db, todos, DIAS, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA } from './db';
import { normalizar, parsearCsv, type Fila } from './csv';
import { esEmail, esFecha, esHora, slugify } from './util';

export type Tipo = 'talleristas' | 'solicitudes' | 'clases';

export const TIPOS_IMPORTAR: Record<Tipo, string> = {
  talleristas: 'Talleristas',
  solicitudes: 'Privados y bonos',
  clases: 'Clases y horarios',
};
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
  repetidas: number;   // filas que ya existían (mismo nombre y email, o mismo horario): se saltan, no es un error
};

/** Lo que se ha entendido del texto: de qué tipo son las filas y las filas con sus columnas. */
export type Entrada = { tipo: Tipo; filas: Fila[] };

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

  // Las talleristas que se importan ya son de Yutori: entran como aceptadas salvo que el texto diga otra cosa.
  const estado = f.estado ? codigoDe(f.estado, ESTADOS_TALLERISTA) : 'aceptada';
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

/** Día de la semana: "lunes" o "1" → 1. */
function diaDe(valor: string): number | null {
  const n = Number(valor);
  if (Number.isInteger(n) && n >= 1 && n <= 7) return n;
  const i = DIAS.findIndex((d) => d && normalizar(d) === normalizar(valor));
  return i > 0 ? i : null;
}

/** Una fila = un horario de una clase. Si la clase no existe, la fila tiene que decir qué tipo de clase es. */
function mapearClase(f: Fila, existentes: Set<string>, tipoDeNueva: Map<string, string>): Mapeo {
  const e: string[] = [];
  if (!f.clase) e.push('falta «clase»');
  const nombre = f.clase ?? '';
  const nueva = !existentes.has(normalizar(nombre));
  if (nueva && nombre && !tipoDeNueva.has(normalizar(nombre))) e.push(`«${nombre}» es una clase nueva: indica su «tipo_clase» (p. ej. "Club de ganchillo")`);

  const dia = diaDe(f.dia ?? '');
  if (!dia) e.push(`el día «${f.dia ?? ''}» no vale (usa: lunes… domingo, o 1-7)`);
  if (!esHora(f.hora_inicio ?? '')) e.push(`«hora_inicio» tiene que ser HH:MM (has escrito «${f.hora_inicio ?? ''}»)`);
  if (!esHora(f.hora_fin ?? '')) e.push(`«hora_fin» tiene que ser HH:MM (has escrito «${f.hora_fin ?? ''}»)`);

  const plazas = f.plazas ? Number(f.plazas) : 8;
  if (!Number.isInteger(plazas) || plazas < 1) e.push(`«plazas» tiene que ser un número entero (has escrito «${f.plazas}»)`);

  const publico = f.publico ? codigoDe(f.publico, { adultos: 'Adultos', ninos: 'Niños' }) : 'adultos';
  if (!publico) e.push(`«publico» no vale (usa: adultos o ninos)`);

  // El precio se escribe en euros ("45" o "45,50") y se guarda en céntimos.
  const euros = f.precio_mes ? Number(f.precio_mes.replace(',', '.')) : null;
  if (euros !== null && !(euros >= 0)) e.push(`«precio_mes» tiene que ser un importe en euros (has escrito «${f.precio_mes}»)`);
  const precio = euros === null ? null : Math.round(euros * 100);

  const tipoClase = nueva ? tipoDeNueva.get(normalizar(nombre)) ?? null : null;
  const datos = {
    clase: nombre, tipo_clase: tipoClase, slug: nueva ? slugify(nombre) : null,
    dia_semana: dia, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, plazas, publico, precio_mes_cent: precio,
  };
  return {
    datos: e.length ? null : datos,
    vista: [nombre, dia ? DIAS[dia] : '—', `${f.hora_inicio ?? ''}-${f.hora_fin ?? ''}`, publico ? (publico === 'ninos' ? 'Niños' : 'Adultos') : '—', String(plazas)],
    errores: e,
  };
}

// ——— Separar el texto ———

/** Si las cabeceras son las de una de las tablas, sabemos el tipo sin preguntar a la IA. */
function detectarTipo(filas: Fila[]): Tipo | null {
  const columnas = Object.keys(filas[0] ?? {});
  if (columnas.includes('clase') || columnas.includes('dia')) return 'clases';
  if (columnas.includes('propuesta') || columnas.includes('ha_impartido') || columnas.includes('autonoma')) return 'talleristas';
  if (columnas.includes('tipo') || columnas.includes('tipo_bono')) return 'solicitudes';
  return null;
}

// Mismas columnas que reconoce el importador. La IA devuelve todas; las que no existan van vacías (null).
const CAMPOS = ['nombre', 'email', 'telefono', 'marca', 'instagram', 'categoria', 'propuesta', 'ha_impartido', 'autonoma', 'estado',
  'tipo', 'motivo', 'tipo_bono', 'detalle', 'para_quien', 'mensaje', 'fecha_aprox', 'personas',
  'clase', 'tipo_clase', 'dia', 'hora_inicio', 'hora_fin', 'plazas', 'publico', 'precio_mes'] as const;

const respuestaSchema = z.object({
  tipo: z.enum(['talleristas', 'solicitudes', 'clases']).describe(
    'talleristas: profesionales que proponen talleres; solicitudes: privados o bonos regalo; clases: horarios de clases semanales'),
  filas: z.array(z.object(Object.fromEntries(CAMPOS.map((c) => [c, z.string().nullable()])) as Record<(typeof CAMPOS)[number], z.ZodNullable<z.ZodString>>)),
});

const INSTRUCCIONES = `Eres el asistente de importación del panel de Yutori Espacio Creativo.
Recibes un texto pegado (una lista, una tabla copiada, mensajes de contacto, horarios…) con personas o clases y sus datos.
Sepáralo en filas: una fila por persona (o por horario de clase), con los datos en las columnas indicadas.

Reglas:
- Usa SOLO la información del texto. Si un dato no aparece, déjalo null. Nunca inventes emails, teléfonos, horas ni fechas.
- Un mismo texto no mezcla tipos: elige uno para todo.
- Talleristas: nombre, marca, instagram, email, telefono, categoria, propuesta (qué ofrece), ha_impartido ("sí"/"no"), autonoma ("sí"/"no"), estado.
- Privados/bonos: tipo ("privado" o "bono"), nombre, email, telefono, motivo, categoria, fecha_aprox (AAAA-MM-DD), personas (número), tipo_bono ("taller" o "importe"), detalle, para_quien, mensaje, estado.
- Clases: clase (nombre de la clase), tipo_clase (cómo se llama el tipo de clase, solo si el texto lo dice), dia ("lunes"… "domingo"), hora_inicio y hora_fin (HH:MM), plazas (número), publico ("adultos" o "ninos"), precio_mes (euros, número).
- categoria debe ser EXACTAMENTE una de estas: {CATEGORIAS}. Si no encaja, null.
- estado: solo si el texto lo dice; si no, null.
- Responde solo con JSON que cumpla el esquema.`;

/** Pide a la IA que separe el texto. Su respuesta se vuelve a validar fila a fila antes de guardar nada. */
async function extraerConIA(texto: string): Promise<Entrada> {
  if (!env.GROQ_API_KEY) throw new Error('Sin IA configurada: pon las columnas con sus nombres (nombre, email, …) en la primera fila.');
  const categorias = (await todos<{ nombre: string }>('SELECT nombre FROM categorias')).map((c) => c.nombre).join(', ');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 8000,
      messages: [
        { role: 'system', content: INSTRUCCIONES.replace('{CATEGORIAS}', categorias) },
        { role: 'user', content: texto },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'importacion_yutori', strict: true, schema: z.toJSONSchema(respuestaSchema, { target: 'openai' }) },
      },
    }),
  });
  if (!r.ok) throw new Error(`La IA no ha podido separar el texto (Groq ${r.status}).`);
  const datos = (await r.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const eleccion = datos.choices?.[0];
  if (!eleccion?.message?.content || eleccion.finish_reason !== 'stop') throw new Error('La IA no ha devuelto una respuesta completa.');
  const { tipo, filas } = respuestaSchema.parse(JSON.parse(eleccion.message.content));
  // Quitamos los nulos y vacíos para que tengan la misma forma que las filas del CSV.
  const limpias = filas.map((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v && v.trim() !== '').map(([k, v]) => [k, v!.trim()])));
  return { tipo, filas: limpias };
}

/** Decide qué es el texto pegado: si las columnas se reconocen se lee tal cual; si no, la IA lo separa. */
export async function leerEntrada(texto: string): Promise<Entrada> {
  const filas = parsearCsv(texto);
  const tipo = detectarTipo(filas);
  return tipo ? { tipo, filas } : extraerConIA(texto);
}

/** Valida cada fila, avisa de las que ya existen en la base y de las que tienen errores. No guarda nada. */
export async function preparar({ tipo, filas }: Entrada): Promise<Preparado> {
  const categorias = new Map(
    (await todos<{ id: number; nombre: string }>('SELECT id, nombre FROM categorias')).map((c) => [normalizar(c.nombre), c.id]),
  );

  // Clave para detectar repetidas: mismo nombre y mismo email (sin mayúsculas ni acentos).
  // En clases, la clave es la clase + día + hora de inicio + público.
  let clave: (f: Fila) => string;
  let vistas: Set<string>;
  const existentes = new Set<string>();   // nombres de clases ya guardadas
  const tipoDeNueva = new Map<string, string>(); // clases nuevas del texto → su tipo

  if (tipo === 'clases') {
    const guardadas = await todos<{ nombre: string; dia_semana: number; hora_inicio: string; publico: string; slug: string }>(
      `SELECT c.nombre, g.dia_semana, g.hora_inicio, g.publico, c.slug FROM grupos g JOIN clases c ON c.id = g.clase_id`);
    const clases = await todos<{ nombre: string }>('SELECT nombre FROM clases');
    clases.forEach((c) => existentes.add(normalizar(c.nombre)));
    vistas = new Set(guardadas.map((g) => `${normalizar(g.nombre)}|${g.dia_semana}|${g.hora_inicio}|${g.publico}`));
    clave = (f) => `${normalizar(f.clase ?? '')}|${diaDe(f.dia ?? '')}|${f.hora_inicio}|${normalizar(f.publico || 'adultos')}`;
    // El tipo de una clase nueva se toma de la primera fila que lo diga.
    for (const f of filas) if (f.clase && f.tipo_clase && !tipoDeNueva.has(normalizar(f.clase))) tipoDeNueva.set(normalizar(f.clase), f.tipo_clase);
  } else {
    vistas = new Set(
      (await todos<{ nombre: string; email: string }>(`SELECT nombre, email FROM ${tipo}`)).map((r) => `${normalizar(r.email)}|${normalizar(r.nombre)}`),
    );
    clave = (f) => `${normalizar(f.email ?? '')}|${normalizar(f.nombre ?? '')}`;
  }

  const cabecera = tipo === 'talleristas' ? ['Nombre', 'Email', 'Categoría', 'Estado']
    : tipo === 'solicitudes' ? ['Tipo', 'Nombre', 'Email', 'Categoría', 'Estado']
    : ['Clase', 'Día', 'Horario', 'Público', 'Plazas'];
  const preparado: Preparado = { cabecera, validas: [], errores: [], repetidas: 0 };

  filas.forEach((f, i) => {
    const linea = i + 2; // la cabecera es la línea 1
    if (!f.nombre && !f.email && !f.clase) return;
    const mapeo = tipo === 'talleristas' ? mapearTallerista(f, categorias)
      : tipo === 'solicitudes' ? mapearSolicitud(f, categorias)
      : mapearClase(f, existentes, tipoDeNueva);
    if (mapeo.errores.length) {
      preparado.errores.push(`Fila ${linea}: ${mapeo.errores.join('; ')}`);
      return;
    }
    const k = clave(f);
    if (vistas.has(k)) { preparado.repetidas++; return; }
    vistas.add(k); // así también se detectan repetidas dentro del mismo texto
    preparado.validas.push({ datos: mapeo.datos!, vista: mapeo.vista });
  });

  // Dos clases nuevas con nombres distintos pero el mismo slug chocarían en la base de datos.
  if (tipo === 'clases') {
    const slugs = new Set((await todos<{ slug: string }>('SELECT slug FROM clases')).map((c) => c.slug));
    for (const f of preparado.validas) {
      const slug = f.datos.slug as string | null;
      if (slug && slugs.has(slug)) {
        preparado.errores.push(`«${f.datos.clase}»: ya hay una clase con un nombre parecido. Usa ese nombre exacto.`);
      }
    }
  }
  return preparado;
}

/** Guarda las filas válidas. D1 ejecuta el lote entero como una transacción: o entran todas o ninguna. */
export async function importar(tipo: Tipo, filas: Filas[]) {
  if (tipo === 'clases') {
    // Primero las clases nuevas (una sola vez por clase), luego sus horarios, que buscan la clase por nombre.
    const nuevas = new Map<string, { nombre: string; slug: string; tipo: string }>();
    for (const { datos } of filas) {
      if (datos.slug && datos.tipo_clase) nuevas.set(datos.clase as string, { nombre: datos.clase as string, slug: datos.slug as string, tipo: datos.tipo_clase as string });
    }
    const sentencias = [
      ...[...nuevas.values()].map((c) => db()
        .prepare(`INSERT INTO clases (slug, nombre, tipo, modalidades) VALUES (?1, ?2, ?3, '[]')`)
        .bind(c.slug, c.nombre, c.tipo)),
      ...filas.map(({ datos }) => db()
        .prepare(`INSERT INTO grupos (clase_id, dia_semana, hora_inicio, hora_fin, plazas, publico, precio_mes_cent)
                  VALUES ((SELECT id FROM clases WHERE nombre = ?1 LIMIT 1), ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(datos.clase, datos.dia_semana, datos.hora_inicio, datos.hora_fin, datos.plazas, datos.publico, datos.precio_mes_cent)),
    ];
    if (sentencias.length) await db().batch(sentencias);
    return filas.length;
  }

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
