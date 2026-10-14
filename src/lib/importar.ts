// Importación de datos al panel: separa el texto pegado (con la IA si hace falta), valida cada fila,
// descarta las repetidas y guarda todo en una sola transacción.
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db, todos, DIAS, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA } from './db';
import { normalizar, parsearCsv, type Fila } from './csv';
import { esEmail, esFecha, esHora, slugify } from './util';
import { meses, nombreMes } from './clases';

export type Tipo = 'talleristas' | 'alumnas' | 'solicitudes' | 'clases';

export const TIPOS_IMPORTAR: Record<Tipo, string> = {
  talleristas: 'talleristas',
  alumnas: 'alumnas de las clases mensuales',
  solicitudes: 'talleres privados y bonos regalo',
  clases: 'horarios de clases',
};
export const TIPOS_SOLICITUD: Record<string, string> = { privado: 'Privado', bono: 'Bono regalo' };
export const TIPOS_BONO: Record<string, string> = { taller: 'Taller', importe: 'Importe' };

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

export type Mapeo = { datos: Record<string, unknown> | null; vista: string[]; errores: string[] };

/** Categorías por nombre normalizado → id. */
export async function mapaCategorias() {
  return new Map((await todos<{ id: number; nombre: string }>('SELECT id, nombre FROM categorias')).map((c) => [normalizar(c.nombre), c.id]));
}

export function mapearTallerista(f: Fila, categorias: Map<string, number>): Mapeo {
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
    ha_impartido: haImpartido, autonoma, estado, notas: f.notas || null,
  };
  return {
    datos: e.length ? null : datos,
    vista: [f.nombre, f.email, f.categoria ?? '—', ESTADOS_TALLERISTA[estado ?? ''] ?? '—'],
    errores: e,
  };
}

export function mapearSolicitud(f: Fila, categorias: Map<string, number>): Mapeo {
  const e: string[] = [];
  for (const campo of ['nombre', 'email']) if (!f[campo]) e.push(`falta «${campo}»`);
  if (f.email && !esEmail(f.email)) e.push(`el email «${f.email}» no es válido`);

  const tipo = codigoDe(f.tipo ?? '', TIPOS_SOLICITUD);
  if (!tipo) e.push(`el tipo «${f.tipo ?? ''}» no vale (usa: privado o bono)`);

  const tipoBono = f.tipo_bono ? codigoDe(f.tipo_bono, TIPOS_BONO) : null;
  if (f.tipo_bono && !tipoBono) e.push(`el tipo de bono «${f.tipo_bono}» no vale (usa: taller o importe)`);
  if (tipo === 'bono' && !tipoBono) e.push('un bono necesita «tipo_bono» (taller o importe)');

  // Privados: uno o varios tipos de taller ("Bordado, Joyería"). Cada uno tiene que existir en el panel.
  const tipos = (f.tipos_taller || f.categoria || '').split(',').map((t) => t.trim()).filter(Boolean);
  const desconocidos = tipos.filter((t) => !categorias.has(normalizar(t)));
  if (desconocidos.length) e.push(`la categoría «${desconocidos.join(', ')}» no existe en el panel`);
  const categoriaId = tipos.length === 1 ? categorias.get(normalizar(tipos[0])) ?? null : null;

  const estado = f.estado ? codigoDe(f.estado, ESTADOS_SOLICITUD) : 'nueva';
  if (!estado) e.push(`el estado «${f.estado}» no vale (usa: ${Object.values(ESTADOS_SOLICITUD).join(', ')})`);

  const fechaAprox = f.fecha_aprox ? fechaDe(f.fecha_aprox, 'fecha_aprox', e) : null;
  const personas = f.personas ? Number(f.personas) : null;
  if (personas !== null && (!Number.isInteger(personas) || personas < 1)) e.push(`«personas» tiene que ser un número entero (has escrito «${f.personas}»)`);

  const datos = {
    tipo, nombre: f.nombre, email: f.email, telefono: f.telefono || null, motivo: f.motivo || null,
    categoria_id: categoriaId, tipos_taller: tipos.length ? tipos.join(', ') : null, fecha_aprox: fechaAprox, personas, tipo_bono: tipoBono,
    detalle: f.detalle || null, para_quien: f.para_quien || null, mensaje: f.mensaje || null, estado, notas: f.notas || null,
  };
  return {
    datos: e.length ? null : datos,
    vista: [TIPOS_SOLICITUD[tipo ?? ''] ?? '—', f.nombre, f.email, tipos.join(', ') || '—', ESTADOS_SOLICITUD[estado ?? ''] ?? '—'],
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

/** "18" o "9:30" → "18:00" / "09:30". */
function horaDe(valor: string) {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?h?$/.exec(valor.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` : valor.trim();
}

export type HorarioRef = {
  id: number; nombre: string; dia_semana: number; hora_inicio: string; hora_fin: string; publico: string; plazas: number; modalidades: string;
};
export const horarioTexto = (g: HorarioRef) =>
  `${g.nombre} · ${DIAS[g.dia_semana]} ${g.hora_inicio}-${g.hora_fin}${g.publico === 'ninos' ? ' · niños' : ''}`;

export const horariosActivos = () => todos<HorarioRef>(`
  SELECT g.id, c.nombre, g.dia_semana, g.hora_inicio, g.hora_fin, g.publico, g.plazas, c.modalidades
  FROM grupos g JOIN clases c ON c.id = g.clase_id WHERE g.activo = 1 AND c.activa = 1
  ORDER BY c.id, g.publico, g.dia_semana, g.hora_inicio`);

/**
 * Una fila = una alumna apuntada a un horario durante un mes. El horario llega por id (formulario)
 * o por clase + día + hora (texto pegado). Por defecto: el mes actual y ya pagada.
 */
export function mapearAlumna(f: Fila, horarios: HorarioRef[]): Mapeo {
  const e: string[] = [];
  if (!f.nombre) e.push('falta el nombre');
  if (!f.telefono) e.push('falta el teléfono');
  if (f.email && !esEmail(f.email)) e.push(`el email «${f.email}» no es válido`);

  let g: HorarioRef | null = null;
  if (f.grupo_id) {
    g = horarios.find((h) => String(h.id) === f.grupo_id) ?? null;
    if (!g) e.push('elige un horario');
  } else if (f.clase) {
    const dia = f.dia ? diaDe(f.dia) : null;
    const hora = f.hora_inicio ? horaDe(f.hora_inicio) : null;
    const publico = f.publico ? codigoDe(f.publico, { adultos: 'Adultos', ninos: 'Niños' }) : null;
    const candidatos = horarios.filter((h) => normalizar(h.nombre) === normalizar(f.clase!)
      && (!dia || h.dia_semana === dia) && (!hora || h.hora_inicio === hora) && (!publico || h.publico === publico));
    if (candidatos.length === 1) g = candidatos[0];
    else e.push(candidatos.length > 1
      ? `«${f.clase}» tiene varios horarios: indica el día y la hora`
      : `no encuentro el horario «${[f.clase, f.dia, f.hora_inicio].filter(Boolean).join(' ')}»`);
  } else {
    e.push('falta el horario (clase, día y hora)');
  }

  const { actual, siguiente } = meses();
  const mesTexto = normalizar(f.mes ?? '');
  const mes = !mesTexto ? actual
    : [actual, siguiente].find((m) => m === f.mes || normalizar(nombreMes(m)).startsWith(mesTexto)) ?? null;
  if (!mes) e.push(`el mes «${f.mes}» no vale: solo ${nombreMes(actual)} o ${nombreMes(siguiente)}`);

  const est = normalizar(f.estado ?? '');
  const estado = !est || /^(pagad|confirm|si)/.test(est) ? 'confirmada' : /^(pend|no)/.test(est) ? 'pendiente' : null;
  if (!estado) e.push(`el pago tiene que ser «pagado» o «pendiente» (has escrito «${f.estado}»)`);

  const modalidades: string[] = g ? JSON.parse(g.modalidades || '[]') : [];
  const modalidad = f.modalidad ? modalidades.find((m) => normalizar(m) === normalizar(f.modalidad!)) ?? null : null;
  if (f.modalidad && modalidades.length && !modalidad) e.push(`la modalidad «${f.modalidad}» no vale (usa: ${modalidades.join(' o ')})`);

  if (g?.publico === 'ninos' && !f.nombre_menor) e.push('es una clase de niños: falta el nombre del niño o la niña');

  const datos = {
    grupo_id: g?.id, mes, nombre: f.nombre, telefono: f.telefono, email: f.email || '',
    modalidad, nombre_menor: f.nombre_menor || null, estado,
  };
  return {
    datos: e.length ? null : datos,
    vista: [f.nombre_menor ? `${f.nombre_menor} (${f.nombre})` : f.nombre ?? '—', g ? horarioTexto(g) : '—',
      mes ? nombreMes(mes) : '—', estado === 'pendiente' ? 'Pendiente de pago' : 'Pagada'],
    errores: e,
  };
}

// ——— Separar el texto ———

// Mismas columnas que reconoce el importador. La IA devuelve todas; las que no existan van vacías (null).
const CAMPOS = ['nombre', 'email', 'telefono', 'marca', 'instagram', 'categoria', 'propuesta', 'ha_impartido', 'autonoma', 'estado',
  'tipo', 'motivo', 'tipo_bono', 'detalle', 'para_quien', 'mensaje', 'fecha_aprox', 'personas',
  'clase', 'tipo_clase', 'dia', 'hora_inicio', 'hora_fin', 'plazas', 'publico', 'precio_mes',
  'nombre_menor', 'modalidad', 'mes', 'notas'] as const;

const respuestaSchema = z.object({
  filas: z.array(z.object(Object.fromEntries(CAMPOS.map((c) => [c, z.string().nullable()])) as Record<(typeof CAMPOS)[number], z.ZodNullable<z.ZodString>>)),
});

const INSTRUCCIONES = `Eres el asistente de importación del panel de Yutori Espacio Creativo.
Recibes un texto pegado (una lista, una tabla copiada, mensajes de contacto, horarios…) con datos de: {TIPO}.
Sepáralo en filas: una fila por persona (o por horario de clase), con los datos en las columnas indicadas.

Reglas:
- Usa SOLO la información del texto. Si un dato no aparece, déjalo null. Nunca inventes emails, teléfonos, horas ni fechas.
- Talleristas: nombre, marca, instagram, email, telefono, categoria, propuesta (qué ofrece), ha_impartido ("sí"/"no"), autonoma ("sí"/"no"), estado.
- Privados/bonos: tipo ("privado" o "bono"), nombre, email, telefono, motivo, categoria, fecha_aprox (AAAA-MM-DD), personas (número), tipo_bono ("taller" o "importe"), detalle, para_quien, mensaje, estado.
- Alumnas: nombre (quien paga o contacta), nombre_menor (en clases de niños, el nombre del niño o la niña), telefono, email, clase, dia, hora_inicio (del horario al que va), publico, modalidad, mes (AAAA-MM, solo si el texto lo dice), estado ("pagado" o "pendiente", solo si el texto lo dice). Horarios que existen: {HORARIOS}.
- Clases: clase (nombre de la clase), tipo_clase (cómo se llama el tipo de clase, solo si el texto lo dice), dia ("lunes"… "domingo"), hora_inicio y hora_fin (HH:MM), plazas (número), publico ("adultos" o "ninos"), precio_mes (euros, número).
- categoria debe ser EXACTAMENTE una de estas: {CATEGORIAS}. Si no encaja, null.
- estado: solo si el texto lo dice; si no, null.
- notas: cualquier otro dato útil del texto sobre esa fila que no encaje en las columnas.
- Responde solo con JSON que cumpla el esquema.`;

/** Pide a la IA que separe el texto. Su respuesta se vuelve a validar fila a fila antes de guardar nada. */
async function extraerConIA(texto: string, tipo: Tipo): Promise<Entrada> {
  if (!env.GROQ_API_KEY) throw new Error('Sin IA configurada: pon las columnas con sus nombres (nombre, email, …) en la primera fila.');
  const categorias = (await todos<{ nombre: string }>('SELECT nombre FROM categorias')).map((c) => c.nombre).join(', ');
  const horarios = (await horariosActivos()).map(horarioTexto).join('; ');
  const sistema = INSTRUCCIONES.replace('{TIPO}', TIPOS_IMPORTAR[tipo]).replace('{CATEGORIAS}', categorias).replace('{HORARIOS}', horarios);
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 8000,
      messages: [
        { role: 'system', content: sistema },
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
  const { filas } = respuestaSchema.parse(JSON.parse(eleccion.message.content));
  // Quitamos los nulos y vacíos para que tengan la misma forma que las filas del CSV.
  const limpias = filas.map((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v && v.trim() !== '').map(([k, v]) => [k, v!.trim()])));
  return { tipo, filas: limpias };
}

/** Lee el texto pegado: si la primera fila tiene nombres de columna conocidos se lee tal cual; si no, la IA lo separa. */
export async function leerEntrada(texto: string, tipo: Tipo): Promise<Entrada> {
  const filas = parsearCsv(texto);
  const conCabeceras = Object.keys(filas[0] ?? {}).some((k) => (CAMPOS as readonly string[]).includes(k));
  return conCabeceras ? { tipo, filas } : extraerConIA(texto, tipo);
}

/** Valida cada fila, avisa de las que ya existen en la base y de las que tienen errores. No guarda nada. */
export async function preparar({ tipo, filas }: Entrada): Promise<Preparado> {
  const categorias = await mapaCategorias();

  // Clave para detectar repetidas: mismo nombre y mismo email (sin mayúsculas ni acentos).
  // En clases, la clase + día + hora de inicio + público. En alumnas, el horario + mes + nombre.
  let clave: (f: Fila, datos: Record<string, unknown>) => string;
  let vistas: Set<string>;
  const existentes = new Set<string>();   // nombres de clases ya guardadas
  const tipoDeNueva = new Map<string, string>(); // clases nuevas del texto → su tipo
  let horarios: HorarioRef[] = [];
  const ocupadas = new Map<string, number>(); // alumnas: horario|mes → plazas ocupadas

  if (tipo === 'clases') {
    const guardadas = await todos<{ nombre: string; dia_semana: number; hora_inicio: string; publico: string }>(
      `SELECT c.nombre, g.dia_semana, g.hora_inicio, g.publico FROM grupos g JOIN clases c ON c.id = g.clase_id`);
    const clases = await todos<{ nombre: string }>('SELECT nombre FROM clases');
    clases.forEach((c) => existentes.add(normalizar(c.nombre)));
    vistas = new Set(guardadas.map((g) => `${normalizar(g.nombre)}|${g.dia_semana}|${g.hora_inicio}|${g.publico}`));
    clave = (f) => `${normalizar(f.clase ?? '')}|${diaDe(f.dia ?? '')}|${f.hora_inicio}|${normalizar(f.publico || 'adultos')}`;
    // El tipo de una clase nueva se toma de la primera fila que lo diga.
    for (const f of filas) if (f.clase && f.tipo_clase && !tipoDeNueva.has(normalizar(f.clase))) tipoDeNueva.set(normalizar(f.clase), f.tipo_clase);
  } else if (tipo === 'alumnas') {
    horarios = await horariosActivos();
    const { actual, siguiente } = meses();
    const apuntadas = await todos<{ grupo_id: number; mes: string; nombre: string; nombre_menor: string | null }>(
      `SELECT grupo_id, mes, nombre, nombre_menor FROM reservas
       WHERE tipo = 'clase_mensual' AND mes IN (?1, ?2) AND estado IN ('pendiente', 'confirmada')`, actual, siguiente);
    const claveAlumna = (g: unknown, mes: unknown, nombre: string, menor: string | null) =>
      `${g}|${mes}|${normalizar(nombre)}|${normalizar(menor ?? '')}`;
    vistas = new Set(apuntadas.map((a) => claveAlumna(a.grupo_id, a.mes, a.nombre, a.nombre_menor)));
    for (const a of apuntadas) ocupadas.set(`${a.grupo_id}|${a.mes}`, (ocupadas.get(`${a.grupo_id}|${a.mes}`) ?? 0) + 1);
    clave = (_f, d) => claveAlumna(d.grupo_id, d.mes, d.nombre as string, d.nombre_menor as string | null);
  } else {
    vistas = new Set(
      (await todos<{ nombre: string; email: string }>(`SELECT nombre, email FROM ${tipo}`)).map((r) => `${normalizar(r.email)}|${normalizar(r.nombre)}`),
    );
    clave = (f) => `${normalizar(f.email ?? '')}|${normalizar(f.nombre ?? '')}`;
  }

  const cabecera = tipo === 'talleristas' ? ['Nombre', 'Email', 'Categoría', 'Estado']
    : tipo === 'solicitudes' ? ['Tipo', 'Nombre', 'Email', 'Categoría', 'Estado']
    : tipo === 'alumnas' ? ['Alumna', 'Horario', 'Mes', 'Pago']
    : ['Clase', 'Día', 'Horario', 'Público', 'Plazas'];
  const preparado: Preparado = { cabecera, validas: [], errores: [], repetidas: 0 };

  filas.forEach((f, i) => {
    const n = i + 1;
    if (!f.nombre && !f.email && !f.clase && !f.grupo_id) return;
    const mapeo = tipo === 'talleristas' ? mapearTallerista(f, categorias)
      : tipo === 'solicitudes' ? mapearSolicitud(f, categorias)
      : tipo === 'alumnas' ? mapearAlumna(f, horarios)
      : mapearClase(f, existentes, tipoDeNueva);
    const quien = f.nombre || f.clase || `n.º ${n}`;
    if (mapeo.errores.length) {
      preparado.errores.push(`${quien}: ${mapeo.errores.join('; ')}`);
      return;
    }
    const k = clave(f, mapeo.datos!);
    if (vistas.has(k)) { preparado.repetidas++; return; }
    vistas.add(k); // así también se detectan repetidas dentro del mismo texto
    if (tipo === 'alumnas') {
      const d = mapeo.datos!;
      const h = horarios.find((x) => x.id === d.grupo_id)!;
      const usadas = (ocupadas.get(`${h.id}|${d.mes}`) ?? 0) + 1;
      ocupadas.set(`${h.id}|${d.mes}`, usadas);
      if (usadas > h.plazas) {
        preparado.errores.push(`${quien}: ${horarioTexto(h)} ya tiene sus ${h.plazas} plazas ocupadas en ${nombreMes(d.mes as string)}. Sube las plazas del horario si cabe más gente.`);
        return;
      }
    }
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

  if (tipo === 'alumnas') {
    // Alumnas que ya venían a clase antes de la web: entran como reservas mensuales, sin emails automáticos.
    const sentencias = filas.map(({ datos: d }) => db()
      .prepare(`INSERT INTO reservas (tipo, grupo_id, mes, nombre, telefono, email, modalidad, nombre_menor, estado, codigo)
                VALUES ('clase_mensual', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, lower(hex(randomblob(12))))`)
      .bind(d.grupo_id, d.mes, d.nombre, d.telefono, d.email, d.modalidad, d.nombre_menor, d.estado));
    if (sentencias.length) await db().batch(sentencias);
    return sentencias.length;
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

// ——— Lo que usan las páginas «+ Añadir» ———

/** Estado de la página después de enviar: errores, valores escritos, vista previa de lo pegado o cuántas se han guardado. */
export type Envio = {
  modo: 'una' | 'pegar' | 'confirmar' | null;
  errores: string[];
  valores: Fila;
  texto: string;
  prep: Preparado | null;
  entrada: Entrada | null;
  guardadas: number | null;
};

const NOMBRES_CAMPO: Record<string, string> = {
  propuesta: 'qué taller ofrece', ha_impartido: 'ha dado talleres', tipo_bono: 'tipo de bono', fecha_aprox: 'fecha',
  tipo_clase: 'qué es', hora_inicio: 'empieza', hora_fin: 'termina', precio_mes: 'precio al mes', publico: 'para',
};

/**
 * Errores de una fila tal y como se enseñan en un formulario: uno por línea, empezando en mayúscula
 * y con el nombre del campo en lugar del de la columna («tipo_bono» → «tipo de bono»).
 */
export function mensajes(errores: string[]) {
  return errores.flatMap((e) => e.split('; '))
    .map((e) => e.replace(/«(\w+)»/g, (m, c: string) => (NOMBRES_CAMPO[c] ? `«${NOMBRES_CAMPO[c]}»` : m)))
    .map((e) => e[0].toUpperCase() + e.slice(1) + (e.endsWith('.') ? '' : '.'));
}

const entradaGuardada = z.object({
  tipo: z.enum(['talleristas', 'alumnas', 'solicitudes', 'clases']),
  filas: z.array(z.record(z.string(), z.string())).max(MAX_FILAS),
});

/**
 * Procesa los formularios de añadir: «una» (el formulario normal), «pegar» (texto o CSV, enseña la vista previa)
 * y «confirmar» (guarda lo revisado). Si algo está mal no se guarda nada.
 */
export async function procesarEnvio(datos: FormData, tipo: Tipo): Promise<Envio> {
  const modo = String(datos.get('modo') ?? '');
  const r: Envio = { modo: null, errores: [], valores: {}, texto: '', prep: null, entrada: null, guardadas: null };

  if (modo === 'una') {
    r.modo = 'una';
    // Las casillas con el mismo nombre (varios tipos de taller) se juntan: "Bordado, Joyería".
    for (const [k, v] of datos.entries()) {
      if (typeof v !== 'string' || k === 'modo') continue;
      r.valores[k] = r.valores[k] ? `${r.valores[k]}, ${v.trim()}` : v.trim();
    }
    if (r.valores.clase === '__nueva') r.valores.clase = r.valores.clase_nueva ?? '';
    r.prep = await preparar({ tipo, filas: [r.valores] });
    if (r.prep.errores.length) r.errores = mensajes(r.prep.errores.map((e) => e.replace(/^[^:]*: /, '')));
    else if (r.prep.repetidas) r.errores = ['Ya estaba guardado: no se ha añadido otra vez.'];
    else if (r.prep.validas.length === 0) r.errores = ['Rellena los datos.'];
    else r.guardadas = await importar(tipo, r.prep.validas);
    r.prep = null;
    return r;
  }

  r.modo = modo === 'confirmar' ? 'confirmar' : 'pegar';
  if (r.modo === 'confirmar') {
    let json: unknown = null;
    try { json = JSON.parse(String(datos.get('entrada') ?? '')); } catch { /* se avisa abajo */ }
    const leida = entradaGuardada.safeParse(json);
    if (leida.success && leida.data.tipo === tipo) r.entrada = leida.data;
    else r.errores.push('No se han podido leer las filas. Vuelve a pegar el texto.');
  } else {
    const archivo = datos.get('archivo');
    if (archivo instanceof File && archivo.size > 0) {
      if (archivo.size > MAX_BYTES) r.errores.push('El archivo pesa más de 1 MB.');
      else r.texto = await archivo.text();
    } else {
      r.texto = String(datos.get('texto') ?? '');
    }
    if (!r.errores.length && !r.texto.trim()) r.errores.push('Pega el texto o sube un archivo.');
    if (!r.errores.length) {
      try {
        r.entrada = await leerEntrada(r.texto, tipo);
      } catch (e) {
        r.errores.push(e instanceof Error ? e.message : 'No se ha podido leer el texto.');
      }
    }
  }

  if (r.entrada && !r.errores.length) {
    r.prep = await preparar(r.entrada);
    if (r.prep.validas.length > MAX_FILAS) r.errores.push(`Son ${r.prep.validas.length}: como máximo se añaden ${MAX_FILAS} de una vez.`);
    else if (r.prep.validas.length === 0 && r.prep.errores.length === 0) {
      r.errores.push('No hay nada nuevo: todo ya estaba guardado o no se ha encontrado nada en el texto.');
    }
  }
  if (r.modo === 'confirmar' && r.prep && !r.errores.length && !r.prep.errores.length) {
    r.guardadas = await importar(tipo, r.prep.validas);
  }
  return r;
}
