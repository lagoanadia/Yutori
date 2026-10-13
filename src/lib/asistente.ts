// Asistente del panel (como en Cadence): Iris dicta o escribe lo que quiere cambiar, Groq lo convierte en
// una lista de acciones, Iris las revisa y desmarca, y solo entonces se aplican.
// La respuesta de la IA es una entrada NO fiable: se valida con el mismo esquema al recibirla y al aplicarla,
// y los nombres solo se buscan entre los datos reales de la base de datos.
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db, todos, uno, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA, FRANJAS } from './db';
import { hoyEspana } from './reservas';
import { crearHueco, desactivarTaller, publicarTaller } from './talleres';
import { esHora } from './util';
import { actualizarCalendario } from './calendario';

export const asistenteActivo = () => Boolean(env.GROQ_API_KEY);

// Modelo grande y de los pocos de Groq con salida JSON estricta (strict: true), igual que en Cadence.
const MODELO = 'openai/gpt-oss-120b';

const fecha = z.string().describe('Fecha AAAA-MM-DD');
const nulo = <T extends z.ZodTypeAny>(t: T, desc: string) => t.nullable().describe(`${desc} (null si no se dice)`);
const taller = z.string().describe('Título exacto de uno de los talleres de la lista, o su fecha AAAA-MM-DD si no tiene título');
const camposTaller = {
  titulo: nulo(z.string(), 'Nombre del taller'),
  hora_inicio: nulo(z.string(), 'Hora de inicio HH:MM'),
  hora_fin: nulo(z.string(), 'Hora de fin HH:MM'),
  precio_euros: nulo(z.number(), 'Precio por persona en euros'),
  plazas: nulo(z.number().int(), 'Número de plazas'),
  texto: nulo(z.string(), 'Texto informativo del taller, bien redactado en castellano'),
  materiales: nulo(z.string(), '"Material incluido" o "Trae: …"'),
  datos_pago: nulo(z.string(), 'Cómo pagan las alumnas, p. ej. "Bizum al 600 000 000 (nombre)"'),
};

export const accionSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('crear_taller'),
    tallerista: nulo(z.string(), 'Nombre o marca de una tallerista ACEPTADA de la lista; null si lo imparte la propia dueña (Yutori)'),
    fecha,
    momento: z.enum(['manana', 'tarde']),
    ...camposTaller,
  }),
  z.object({ tipo: z.literal('editar_taller'), taller, ...camposTaller }),
  z.object({ tipo: z.literal('publicar_taller'), taller }),
  z.object({ tipo: z.literal('desactivar_taller'), taller }),
  z.object({
    tipo: z.literal('estado_tallerista'),
    tallerista: z.string().describe('Nombre o marca de una tallerista de la lista'),
    estado: z.enum(['nueva', 'revision', 'aceptada', 'reserva', 'descartada']),
    nota: nulo(z.string(), 'Nota privada'),
  }),
  z.object({
    tipo: z.literal('estado_solicitud'),
    persona: z.string().describe('Nombre de la persona de una petición de la lista'),
    estado: z.enum(['nueva', 'en_curso', 'cerrada']),
    nota: nulo(z.string(), 'Nota privada'),
  }),
]);
export type Accion = z.infer<typeof accionSchema>;

export const planSchema = z.object({
  respuesta: z.string().describe('Una o dos frases cortas y cercanas, en castellano, resumiendo lo que has preparado'),
  acciones: z.array(accionSchema),
});
export type Plan = z.infer<typeof planSchema>;

const ESQUEMA_JSON = z.toJSONSchema(planSchema, { target: 'openai' });

const INSTRUCCIONES = `Eres el asistente del panel de Yutori Espacio Creativo, un espacio de talleres creativos en A Coruña.
La dueña te dice (escrito o dictado) qué quiere cambiar. Conviértelo en una lista de acciones usando SOLO los tipos del esquema.

Reglas:
- Resuelve fechas relativas ("el sábado", "el domingo 25", "mañana") con la fecha de hoy del contexto. Fechas AAAA-MM-DD.
- Los talleres son viernes por la tarde, sábados y domingos (mañana o tarde). "Por la mañana" = manana.
- Usa los nombres EXACTAMENTE como aparecen en las listas. Si no encuentras a la persona o el taller, no inventes: no añadas esa acción y dilo en la respuesta.
- Si un taller es de la propia dueña ("mío", "lo doy yo", "de Yutori"), tallerista = null.
- Precios en euros (número). Horas en formato HH:MM de 24 h.
- Si dicta un texto informativo, redáctalo bien (ortografía y puntuación), sin inventar datos.
- Nunca inventes acciones que no ha pedido. Nunca toques pagos ni reservas: eso no está en tus acciones.
- Si no hay nada que hacer, devuelve la lista vacía y explícalo.
- Responde solo con JSON que cumpla el esquema.`;

/** Lo que la IA necesita saber para relacionar palabras con datos reales. */
async function contexto() {
  const hoy = hoyEspana();
  const [talleristas, talleres, solicitudes] = await Promise.all([
    todos<{ nombre: string; marca: string | null; estado: string }>('SELECT nombre, marca, estado FROM talleristas ORDER BY creado_en DESC LIMIT 80'),
    todos<{ titulo: string | null; fecha: string; franja: string; estado: string; quien: string }>(`
      SELECT t.titulo, t.fecha, t.franja, t.estado, COALESCE(ta.marca, ta.nombre, 'Yutori') AS quien
      FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id
      WHERE t.fecha >= ?1 ORDER BY t.fecha LIMIT 60`, hoy),
    todos<{ nombre: string; tipo: string; estado: string }>(`SELECT nombre, tipo, estado FROM solicitudes WHERE estado <> 'cerrada' ORDER BY creado_en DESC LIMIT 40`),
  ]);
  const dia = new Date(`${hoy}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  return [
    `Hoy: ${hoy} (${dia})`,
    `Talleristas: ${talleristas.map((t) => `${t.nombre}${t.marca ? ` / ${t.marca}` : ''} [${ESTADOS_TALLERISTA[t.estado]}]`).join('; ') || 'ninguna'}`,
    `Talleres próximos: ${talleres.map((t) => `"${t.titulo ?? 'sin título'}" ${t.fecha} ${FRANJAS[t.franja]} · ${t.quien} [${t.estado}]`).join('; ') || 'ninguno'}`,
    `Peticiones abiertas: ${solicitudes.map((s) => `${s.nombre} (${s.tipo === 'privado' ? 'taller privado' : 'bono'}, ${ESTADOS_SOLICITUD[s.estado]})`).join('; ') || 'ninguna'}`,
  ].join('\n');
}

export async function planear(texto: string): Promise<Plan> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: INSTRUCCIONES },
        { role: 'user', content: `Contexto:\n${await contexto()}\n\nMensaje:\n${texto}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'plan_yutori', strict: true, schema: ESQUEMA_JSON } },
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const datos = (await r.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const eleccion = datos.choices?.[0];
  if (!eleccion?.message?.content || eleccion.finish_reason !== 'stop') throw new Error(`Sin plan (${eleccion?.finish_reason})`);
  return planSchema.parse(JSON.parse(eleccion.message.content));
}

// ——— Buscar nombres entre los datos reales (sin tildes ni mayúsculas) ———

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function buscarTallerista(nombre: string, soloAceptadas = false) {
  const lista = await todos<{ id: number; nombre: string; marca: string | null }>(
    `SELECT id, nombre, marca FROM talleristas ${soloAceptadas ? "WHERE estado = 'aceptada'" : ''}`);
  const n = normal(nombre);
  const exactas = lista.filter((t) => normal(t.nombre) === n || (t.marca && normal(t.marca) === n));
  const parecidas = exactas.length ? exactas : lista.filter((t) => normal(t.nombre).includes(n) || (t.marca && normal(t.marca).includes(n)));
  return parecidas.length === 1 ? parecidas[0] : null;
}

async function buscarTaller(ref: string) {
  const lista = await todos<{ id: number; titulo: string | null; fecha: string; estado: string }>(
    `SELECT id, titulo, fecha, estado FROM talleres WHERE fecha >= ?1`, hoyEspana());
  const n = normal(ref);
  const coinciden = lista.filter((t) => t.fecha === ref || (t.titulo && normal(t.titulo) === n));
  const parecidos = coinciden.length ? coinciden : lista.filter((t) => t.titulo && normal(t.titulo).includes(n));
  return parecidos.length === 1 ? parecidos[0] : null;
}

async function buscarSolicitud(persona: string) {
  const lista = await todos<{ id: number; nombre: string }>(`SELECT id, nombre FROM solicitudes WHERE estado <> 'cerrada'`);
  const n = normal(persona);
  const coinciden = lista.filter((s) => normal(s.nombre) === n || normal(s.nombre).includes(n));
  return coinciden.length === 1 ? coinciden[0] : null;
}

// ——— Describir y aplicar ———

type CamposTaller = { titulo: string | null; hora_inicio: string | null; hora_fin: string | null; precio_euros: number | null; plazas: number | null; texto: string | null; materiales: string | null; datos_pago: string | null };

const DIA = (f: string) => new Date(`${f}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function detalles(a: CamposTaller) {
  return [
    a.titulo && `"${a.titulo}"`,
    a.hora_inicio && a.hora_fin && `${a.hora_inicio}-${a.hora_fin}`,
    a.precio_euros != null && `${a.precio_euros} €`,
    a.plazas != null && `${a.plazas} plazas`,
    a.materiales,
    a.datos_pago && `pago: ${a.datos_pago}`,
    a.texto && `texto: "${a.texto.length > 80 ? `${a.texto.slice(0, 80)}…` : a.texto}"`,
  ].filter(Boolean).join(' · ');
}

/** Frase para que Iris revise cada acción antes de aplicarla. */
export function describir(a: Accion) {
  switch (a.tipo) {
    case 'crear_taller': {
      const d = detalles(a);
      return `Crear taller el ${DIA(a.fecha)} por la ${a.momento === 'manana' ? 'mañana' : 'tarde'}, con ${a.tallerista ?? 'Yutori (tú)'}${d ? ` · ${d}` : ''}`;
    }
    case 'editar_taller': return `Cambiar el taller "${a.taller}": ${detalles(a) || 'nada'}`;
    case 'publicar_taller': return `Publicar el taller "${a.taller}"`;
    case 'desactivar_taller': return `Desactivar el taller "${a.taller}" (quitarlo de la web)`;
    case 'estado_tallerista': return `Tallerista ${a.tallerista}: ${ESTADOS_TALLERISTA[a.estado]}${a.nota ? ` · nota: "${a.nota}"` : ''}`;
    case 'estado_solicitud': return `Petición de ${a.persona}: ${ESTADOS_SOLICITUD[a.estado]}${a.nota ? ` · nota: "${a.nota}"` : ''}`;
  }
}

/** Datos de un taller listos para la base de datos, validados (horas, precio y plazas). */
function cambiosTaller(c: CamposTaller) {
  const errores: string[] = [];
  if ((c.hora_inicio && !esHora(c.hora_inicio)) || (c.hora_fin && !esHora(c.hora_fin))) errores.push('Las horas tienen que ser HH:MM.');
  if (c.hora_inicio && c.hora_fin && c.hora_inicio >= c.hora_fin) errores.push('La hora de fin tiene que ser después de la de inicio.');
  if (c.precio_euros != null && (c.precio_euros < 0 || c.precio_euros > 500)) errores.push('El precio tiene que estar entre 0 y 500 €.');
  if (c.plazas != null && (c.plazas < 1 || c.plazas > 30)) errores.push('Las plazas tienen que estar entre 1 y 30.');
  const campos: [string, unknown][] = [
    ['titulo', c.titulo?.slice(0, 100)], ['hora_inicio', c.hora_inicio], ['hora_fin', c.hora_fin],
    ['precio_cent', c.precio_euros != null ? Math.round(c.precio_euros * 100) : null], ['plazas', c.plazas],
    ['texto', c.texto?.slice(0, 3000)], ['materiales', c.materiales?.slice(0, 200)], ['datos_pago', c.datos_pago?.slice(0, 300)],
  ];
  return { errores, campos: campos.filter(([, v]) => v != null) as [string, unknown][] };
}

async function guardarCambios(id: number, campos: [string, unknown][]) {
  if (campos.length === 0) return;
  const sets = campos.map(([k], i) => `${k} = ?${i + 1}`).join(', ');
  // Si el taller era un hueco y ya tiene título, pasa a "enviado" (listo para revisar y publicar).
  await db().prepare(`UPDATE talleres SET ${sets},
      estado = CASE WHEN estado = 'hueco' AND COALESCE(?${campos.length + 1}, titulo) IS NOT NULL THEN 'enviado' ELSE estado END
      WHERE id = ?${campos.length + 2}`)
    .bind(...campos.map(([, v]) => v), campos.find(([k]) => k === 'titulo')?.[1] ?? null, id)
    .run();
  actualizarCalendario(id);
}

export type Resultado = { texto: string; ok: boolean; enlace?: string };

export async function aplicar(a: Accion): Promise<Resultado> {
  const texto = describir(a);
  const fallo = (motivo: string): Resultado => ({ texto: `${texto} — ${motivo}`, ok: false });

  switch (a.tipo) {
    case 'crear_taller': {
      let talleristaId: number | null = null;
      if (a.tallerista) {
        const t = await buscarTallerista(a.tallerista, true);
        if (!t) return fallo(`no encuentro una tallerista aceptada llamada "${a.tallerista}".`);
        talleristaId = t.id;
      }
      const { errores, campos } = cambiosTaller(a);
      if (errores.length) return fallo(errores.join(' '));
      const hueco = await crearHueco({ talleristaId, fecha: a.fecha, momento: a.momento, plazas: a.plazas ?? 8 });
      if (!hueco.ok) return fallo(hueco.errores.join(' '));
      await guardarCambios(hueco.valor, campos.filter(([k]) => k !== 'plazas'));
      return { texto, ok: true, enlace: `/panel/talleres/${hueco.valor}` };
    }
    case 'editar_taller': {
      const t = await buscarTaller(a.taller);
      if (!t) return fallo('no encuentro ese taller (o hay varios que se parecen).');
      if (t.estado === 'publicado' && (a.plazas != null || a.precio_euros != null)) {
        const reservas = await uno<{ n: number }>(`SELECT count(*) AS n FROM reservas WHERE taller_id = ?1 AND estado IN ('pendiente', 'confirmada')`, t.id);
        if ((reservas?.n ?? 0) > 0) return fallo('ya tiene reservas: cambia el precio o las plazas desde su ficha para revisarlo con calma.');
      }
      const { errores, campos } = cambiosTaller(a);
      if (errores.length) return fallo(errores.join(' '));
      await guardarCambios(t.id, campos);
      return { texto, ok: true, enlace: `/panel/talleres/${t.id}` };
    }
    case 'publicar_taller': {
      const t = await buscarTaller(a.taller);
      if (!t) return fallo('no encuentro ese taller.');
      const r = await publicarTaller(t.id);
      return r.ok ? { texto, ok: true, enlace: `/panel/talleres/${t.id}` } : fallo(r.errores.join(' '));
    }
    case 'desactivar_taller': {
      const t = await buscarTaller(a.taller);
      if (!t) return fallo('no encuentro ese taller.');
      await desactivarTaller(t.id);
      return { texto, ok: true, enlace: `/panel/talleres/${t.id}` };
    }
    case 'estado_tallerista': {
      const t = await buscarTallerista(a.tallerista);
      if (!t) return fallo(`no encuentro a "${a.tallerista}" (o hay varias que se parecen).`);
      await db().prepare(`UPDATE talleristas SET estado = ?1, notas = CASE WHEN ?2 IS NULL THEN notas ELSE TRIM(COALESCE(notas || char(10), '') || ?2) END WHERE id = ?3`)
        .bind(a.estado, a.nota, t.id).run();
      return { texto, ok: true, enlace: `/panel/talleristas/${t.id}` };
    }
    case 'estado_solicitud': {
      const s = await buscarSolicitud(a.persona);
      if (!s) return fallo(`no encuentro una petición abierta de "${a.persona}".`);
      await db().prepare(`UPDATE solicitudes SET estado = ?1, notas = CASE WHEN ?2 IS NULL THEN notas ELSE TRIM(COALESCE(notas || char(10), '') || ?2) END WHERE id = ?3`)
        .bind(a.estado, a.nota, s.id).run();
      return { texto, ok: true, enlace: `/panel/solicitudes#s${s.id}` };
    }
  }
}
