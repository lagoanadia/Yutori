// Asistente del panel (como en Cadence): Iris escribe o dicta lo que quiere hacer, como lo diría en voz alta.
// Groq lo convierte en acciones o, si falta algo, en UNA pregunta; la conversación viaja en un campo oculto del formulario
// (sin base de datos) y en cada vuelta la IA recibe todo el hilo. Las acciones se revisan y aplican en asistente-acciones.ts.
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { todos, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA, FRANJAS } from './db';
import { hoyEspana } from './reservas';
import { horariosActivos, horarioTexto } from './importar';
import { accionSchema, frase, type Accion, type Propuesta } from './asistente-acciones';

export { aplicar, describir, frase, propuestaGuardadaSchema, revisar, type Accion, type Propuesta, type Resultado } from './asistente-acciones';

export const asistenteActivo = () => Boolean(env.GROQ_API_KEY);

// Modelo grande y de los pocos de Groq con salida JSON estricta (strict: true), igual que en Cadence.
const MODELO = 'openai/gpt-oss-120b';

export const planSchema = z.object({
  respuesta: z.string().describe('Una o dos frases cortas y cercanas, en castellano. Nunca digas que algo está hecho o guardado: tú no guardas nada'),
  pregunta: z.string().nullable().describe('UNA pregunta corta si falta un dato obligatorio o algo es ambiguo; null si ya puedes preparar las acciones'),
  acciones: z.array(accionSchema),
});
export type Plan = z.infer<typeof planSchema>;

const ESQUEMA_JSON = z.toJSONSchema(planSchema, { target: 'openai' });

export const INSTRUCCIONES = `Eres el asistente del panel de Yutori Espacio Creativo, un espacio de talleres creativos en A Coruña.
La dueña te escribe (o dicta) lo que quiere hacer, con sus palabras y sin plantilla. Conviértelo en acciones usando SOLO los tipos del esquema.
Ella revisa todo antes de guardarlo.

Qué sabes hacer (tipo de acción):
- crear_tallerista: añadir una tallerista. Solo el nombre es obligatorio; marca, instagram, email, teléfono, categoría, propuesta y estado si los dice. Si no dice estado, "aceptada".
- estado_tallerista: cambiar el estado de una tallerista que YA está en la lista (nueva, revision, aceptada, reserva, descartada), con nota opcional.
- crear_hueco: reservar una fecha vacía para un taller (sin título ni datos). Con tallerista si lo va a rellenar ella; null si es de la dueña.
- crear_taller: crear un taller con sus datos (título, horas, precio, plazas, texto, materiales, cómo se paga). Obligatorio: fecha y mañana/tarde.
- editar_taller, publicar_taller, desactivar_taller: sobre un taller de la lista.
- pago_tallerista: la tallerista ha pagado los 25 € de reserva del espacio de su taller.
- crear_peticion: nueva petición de taller privado ("privado") o de bono regalo ("bono"). Obligatorio: nombre y email o teléfono; un bono además necesita tipo_bono (taller o importe).
- estado_solicitud: cambiar el estado de una petición abierta (nueva, en_curso, cerrada), con nota opcional.
- apuntar_alumna: apuntar a una alumna a un horario de clases durante un mes. Obligatorio: nombre, teléfono y el horario (clase, y día/hora si la clase tiene varios). En clases de niños, también el nombre del niño o la niña.
- pago_alumna: una alumna ha pagado su reserva (de taller o de clase) que estaba pendiente de pago.

Cómo trabajas:
- Si falta un dato OBLIGATORIO o algo es ambiguo (dos personas o talleres que encajan, no sabes qué horario…), no inventes ni falles: pon UNA pregunta corta en "pregunta" y deja "acciones" vacía. Los datos opcionales no se preguntan.
- La pregunta es concreta y dice qué dato falta ("¿Cómo se llama la tallerista?", "¿Qué día es el taller?"), nunca "no sé a qué te refieres".
- TÚ NO GUARDAS NADA: solo preparas acciones y ella las revisa y pulsa Guardar. Nunca digas "he añadido", "he creado", "hecho" ni "guardado".
- Los mensajes del asistente que empiezan por "Voy a" son vistas previas que aún NO se han guardado. Los que empiezan por "Hecho:" ya están guardados: no los vuelvas a proponer.
- Lee todo el hilo: si ya te ha contestado, usa la respuesta y no vuelvas a preguntar lo mismo. Cuando tengas lo necesario, pregunta = null y devuelve todas las acciones pedidas en el hilo que no estén ya hechas.
- "Añade/nueva tallerista" es crear_tallerista, aunque diga un estado ("añade a Iris como aceptada"). estado_tallerista es solo para talleristas que ya existen.
- Si pide un taller o un hueco para una tallerista que no está en la lista, pon antes crear_tallerista (estado aceptada) y después el taller. Si está pero no aceptada, pon antes estado_tallerista con aceptada.
- Usa los nombres como aparecen en las listas (puede escribirlos sin tildes o en minúsculas).
- Resuelve fechas relativas ("el sábado", "el domingo 25", "mañana") con la fecha de hoy del contexto. Fechas AAAA-MM-DD.
- Los talleres son viernes por la tarde, sábados y domingos (mañana o tarde). "Por la mañana" = manana.
- Si un taller es de la propia dueña ("mío", "lo doy yo", "de Yutori"), tallerista = null.
- Precios en euros (número). Horas HH:MM de 24 h.
- Si dicta un texto informativo, redáctalo bien (ortografía y puntuación), sin inventar datos.
- Nunca inventes acciones que no ha pedido ni datos que no ha dicho.
- Si solo saluda o pregunta algo, contesta en "respuesta" con lo que sabes hacer, sin acciones.
- Responde solo con JSON que cumpla el esquema.`;

/** Lo que la IA necesita saber para relacionar palabras con datos reales. */
async function contexto() {
  const hoy = hoyEspana();
  const [talleristas, talleres, solicitudes, horarios, categorias, pendientes] = await Promise.all([
    todos<{ nombre: string; marca: string | null; estado: string }>('SELECT nombre, marca, estado FROM talleristas ORDER BY creado_en DESC LIMIT 80'),
    todos<{ titulo: string | null; fecha: string; franja: string; estado: string; quien: string }>(`
      SELECT t.titulo, t.fecha, t.franja, t.estado, COALESCE(ta.marca, ta.nombre, 'Yutori') AS quien
      FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id
      WHERE t.fecha >= ?1 ORDER BY t.fecha LIMIT 60`, hoy),
    todos<{ nombre: string; tipo: string; estado: string }>(`SELECT nombre, tipo, estado FROM solicitudes WHERE estado <> 'cerrada' ORDER BY creado_en DESC LIMIT 40`),
    horariosActivos(),
    todos<{ nombre: string }>('SELECT nombre FROM categorias WHERE activa = 1 ORDER BY nombre'),
    todos<{ nombre: string; nombre_menor: string | null; que: string }>(`
      SELECT r.nombre, r.nombre_menor, COALESCE(t.titulo, c.nombre, 'Taller') AS que
      FROM reservas r LEFT JOIN talleres t ON t.id = r.taller_id
      LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id
      WHERE r.estado = 'pendiente' ORDER BY r.creado_en DESC LIMIT 60`),
  ]);
  const dia = new Date(`${hoy}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  return [
    `Hoy: ${hoy} (${dia})`,
    `Talleristas: ${talleristas.map((t) => `${t.nombre}${t.marca ? ` / ${t.marca}` : ''} [${ESTADOS_TALLERISTA[t.estado]}]`).join('; ') || 'ninguna'}`,
    `Talleres próximos: ${talleres.map((t) => `"${t.titulo ?? 'sin título'}" ${t.fecha} ${FRANJAS[t.franja]} · ${t.quien} [${t.estado}]`).join('; ') || 'ninguno'}`,
    `Peticiones abiertas: ${solicitudes.map((s) => `${s.nombre} (${s.tipo === 'privado' ? 'taller privado' : 'bono'}, ${ESTADOS_SOLICITUD[s.estado]})`).join('; ') || 'ninguna'}`,
    `Horarios de clases: ${horarios.map(horarioTexto).join('; ') || 'ninguno'}`,
    `Categorías: ${categorias.map((c) => c.nombre).join(', ') || 'ninguna'}`,
    `Reservas pendientes de pago: ${pendientes.map((p) => `${p.nombre_menor ? `${p.nombre_menor} (${p.nombre})` : p.nombre} · ${p.que}`).join('; ') || 'ninguna'}`,
  ].join('\n');
}

// ——— Lo que dice el asistente (lo escribe el código, no la IA, para que nunca diga que algo está hecho sin estarlo) ———

/** «a, b y c» */
const lista = (partes: string[]) => (partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`);

const PARTICIPIOS: Record<string, string> = {
  añadir: 'añadido', reservar: 'reservado', crear: 'creado', cambiar: 'cambiado', publicar: 'publicado',
  desactivar: 'desactivado', marcar: 'marcado', poner: 'puesto', apuntar: 'apuntado',
};

/** Mensaje de la vista previa: lo que se VA a hacer y la pregunta de si se guarda. */
export function mensajeVistaPrevia(propuestas: Propuesta[]): string {
  const partes = propuestas.map((p) => { const f = frase(p.accion); return `${f.verbo} ${f.resto}`; });
  const avisos = propuestas.some((p) => !p.marcada) ? ' He dejado sin marcar lo que tiene un aviso.' : '';
  return `Voy a ${lista(partes)}.${avisos} ${propuestas.length > 1 ? '¿Lo guardo todo?' : '¿Lo guardo?'}`;
}

/** Mensaje después de guardar: lo que se ha hecho de verdad y lo que ha fallado. */
export function mensajeHecho(resultados: { accion: Accion; ok: boolean }[]): string {
  if (resultados.length === 0) return 'Vale, no he guardado nada.';
  const hechas = resultados.filter((r) => r.ok).map((r) => { const f = frase(r.accion); return `he ${PARTICIPIOS[f.verbo] ?? f.verbo} ${f.resto}`; });
  const fallos = resultados.filter((r) => !r.ok).map((r) => { const f = frase(r.accion); return `${f.verbo} ${f.resto}`; });
  return [
    hechas.length && `Hecho: ${lista(hechas)}.`,
    fallos.length && `No he podido ${lista(fallos)}.`,
  ].filter(Boolean).join(' ');
}

/** Respuesta de la IA cuando no trae acciones: si dice que ha hecho algo (no puede), se cambia por algo honesto. */
export function respuestaSinAcciones(texto: string): string {
  const limpio = texto.trim();
  if (!limpio || /\b(he|hemos|ya est[áa]n?)\s+(añadid|cread|guardad|apuntad|cambiad|marcad|publicad|reservad|desactivad|hech)/i.test(limpio) || /^hecho\b/i.test(limpio))
    return 'No he preparado ningún cambio. ¿Me dices qué quieres hacer, con nombres y fechas?';
  return limpio;
}

// ——— El hilo de la conversación (viaja en un campo oculto del formulario) ———

export const MAX_TEXTO = 2000;
export const MAX_TURNOS = 16;

const turnoSchema = z.object({ rol: z.enum(['yo', 'asistente']), texto: z.string().max(MAX_TEXTO) });
export type Turno = z.infer<typeof turnoSchema>;

/** Lee el historial del campo oculto. Si llega roto o manipulado, se empieza de cero en vez de fallar. */
export function leerHistorial(valor: unknown): Turno[] {
  try {
    const r = z.array(turnoSchema).safeParse(JSON.parse(String(valor ?? '')));
    return r.success ? r.data.slice(-MAX_TURNOS) : [];
  } catch {
    return [];
  }
}

/** Añade un turno (recortado) y se queda con los últimos MAX_TURNOS para no mandar a la IA un hilo infinito. */
export function anadirTurno(historial: Turno[], rol: Turno['rol'], texto: string): Turno[] {
  const limpio = texto.trim().slice(0, MAX_TEXTO);
  return limpio ? [...historial, { rol, texto: limpio }].slice(-MAX_TURNOS) : historial;
}

/** Mensajes para la IA: instrucciones, datos reales y el hilo entero con sus papeles (usuaria / asistente). */
export function mensajesParaIA(historial: Turno[], datos: string) {
  return [
    { role: 'system', content: INSTRUCCIONES },
    { role: 'system', content: `Contexto (datos reales del panel):\n${datos}` },
    ...historial.map((t) => ({ role: t.rol === 'yo' ? 'user' : 'assistant', content: t.texto })),
  ];
}

/** Valida la respuesta de la IA (texto JSON). Lanza un error si no cumple el esquema. */
export function leerPlan(contenido: string): Plan {
  return planSchema.parse(JSON.parse(contenido));
}

/** Pide a Groq que interprete el hilo. Solo interpreta: no guarda nada. */
export async function planear(historial: Turno[]): Promise<Plan> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_completion_tokens: 3000,
      messages: mensajesParaIA(historial, await contexto()),
      response_format: { type: 'json_schema', json_schema: { name: 'plan_yutori', strict: true, schema: ESQUEMA_JSON } },
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const datos = (await r.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const eleccion = datos.choices?.[0];
  if (!eleccion?.message?.content || eleccion.finish_reason !== 'stop') throw new Error(`Sin plan (${eleccion?.finish_reason})`);
  return leerPlan(eleccion.message.content);
}
