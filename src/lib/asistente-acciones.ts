// Acciones del asistente del panel: qué sabe hacer, cómo se revisa cada una antes de enseñarla y cómo se guarda.
// Aquí no se llama a la IA (eso está en asistente.ts): todo se puede probar con la base de datos de los tests.
// Lo que propone la IA es una entrada NO fiable: se valida con el esquema al recibirlo y otra vez al aplicarlo,
// y los nombres solo se buscan entre los datos reales de la base de datos.
import { z } from 'zod';
import { db, todos, uno, DIAS, ESTADOS_SOLICITUD, ESTADOS_TALLERISTA, FRANJAS } from './db';
import { cambiarEstadoReserva, hoyEspana, liberarCaducadas } from './reservas';
import { crearHueco, desactivarTaller, publicarTaller } from './talleres';
import { marcarPagoReserva } from './acciones';
import { apuntarAlumnaMes, nombreMes } from './clases';
import {
  diaDe, horaDe, horariosActivos, horarioTexto, mapaCategorias, mapearAlumna, mapearSolicitud, mapearTallerista, type HorarioRef,
} from './importar';
import { esFecha, esHora, franjasDeFecha } from './util';
import { actualizarCalendario } from './calendario';

// ——— Qué sabe hacer ———

const fecha = z.string().describe('Fecha AAAA-MM-DD');
const nulo = <T extends z.ZodTypeAny>(t: T, desc: string) => t.nullable().describe(`${desc} (null si no se dice)`);
const momento = z.enum(['manana', 'tarde']);
const taller = z.string().describe('Título de uno de los talleres de la lista, o su fecha AAAA-MM-DD si no tiene título');
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
const estadoTallerista = z.enum(['nueva', 'revision', 'aceptada', 'reserva', 'descartada']);

export const accionSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('crear_tallerista'),
    nombre: z.string().describe('Nombre de la tallerista'),
    marca: nulo(z.string(), 'Marca o nombre artístico'),
    instagram: nulo(z.string(), 'Usuario de Instagram'),
    email: nulo(z.string(), 'Email'),
    telefono: nulo(z.string(), 'Teléfono'),
    categoria: nulo(z.string(), 'Una categoría EXACTA de la lista de categorías'),
    propuesta: nulo(z.string(), 'Qué taller ofrece'),
    estado: nulo(estadoTallerista, 'Estado (si no se dice, aceptada)'),
    nota: nulo(z.string(), 'Nota privada'),
  }),
  z.object({
    tipo: z.literal('crear_hueco'),
    tallerista: nulo(z.string(), 'Nombre o marca de la tallerista que lo rellenará; null si es de la propia dueña (Yutori)'),
    fecha,
    momento,
    plazas: nulo(z.number().int(), 'Número de plazas (8 si no se dice)'),
  }),
  z.object({
    tipo: z.literal('crear_taller'),
    tallerista: nulo(z.string(), 'Nombre o marca de la tallerista; null si lo imparte la propia dueña (Yutori)'),
    fecha,
    momento,
    ...camposTaller,
  }),
  z.object({ tipo: z.literal('editar_taller'), taller, ...camposTaller }),
  z.object({ tipo: z.literal('publicar_taller'), taller }),
  z.object({ tipo: z.literal('desactivar_taller'), taller }),
  z.object({ tipo: z.literal('pago_tallerista'), taller }),
  z.object({
    tipo: z.literal('estado_tallerista'),
    tallerista: z.string().describe('Nombre o marca de una tallerista'),
    estado: estadoTallerista,
    nota: nulo(z.string(), 'Nota privada'),
  }),
  z.object({
    tipo: z.literal('crear_peticion'),
    peticion: z.enum(['privado', 'bono']),
    nombre: z.string().describe('Quién lo pide'),
    email: nulo(z.string(), 'Email'),
    telefono: nulo(z.string(), 'Teléfono'),
    motivo: nulo(z.string(), 'Privado: motivo (cumpleaños, despedida…)'),
    categoria: nulo(z.string(), 'Una categoría EXACTA de la lista de categorías'),
    fecha_aprox: nulo(z.string(), 'Privado: fecha aproximada AAAA-MM-DD'),
    personas: nulo(z.number().int(), 'Privado: número de personas'),
    tipo_bono: nulo(z.enum(['taller', 'importe']), 'Bono: para un taller concreto o por un importe'),
    detalle: nulo(z.string(), 'Bono: qué taller o qué importe'),
    para_quien: nulo(z.string(), 'Bono: para quién es'),
    nota: nulo(z.string(), 'Nota privada'),
  }),
  z.object({
    tipo: z.literal('estado_solicitud'),
    persona: z.string().describe('Nombre de la persona de una petición de la lista'),
    estado: z.enum(['nueva', 'en_curso', 'cerrada']),
    nota: nulo(z.string(), 'Nota privada'),
  }),
  z.object({
    tipo: z.literal('apuntar_alumna'),
    nombre: z.string().describe('Quien paga o contacta'),
    telefono: nulo(z.string(), 'Teléfono'),
    email: nulo(z.string(), 'Email'),
    clase: nulo(z.string(), 'Nombre de la clase de la lista de horarios'),
    dia: nulo(z.string(), 'Día de la semana del horario ("lunes"…)'),
    hora: nulo(z.string(), 'Hora de inicio del horario HH:MM'),
    nombre_menor: nulo(z.string(), 'En clases de niños, el nombre del niño o la niña'),
    modalidad: nulo(z.string(), 'Modalidad, si la clase tiene varias'),
    mes: nulo(z.string(), 'Mes AAAA-MM'),
    pagado: nulo(z.boolean(), 'true si ya ha pagado el mes, false si lo debe'),
  }),
  z.object({
    tipo: z.literal('pago_alumna'),
    persona: z.string().describe('Nombre de quien ha pagado (de la lista de reservas pendientes de pago)'),
    que: nulo(z.string(), 'Taller o clase de esa reserva'),
  }),
]);
export type Accion = z.infer<typeof accionSchema>;

/** Lo que vuelve del navegador al pulsar «Aplicar»: se valida otra vez antes de tocar nada. */
export const propuestaGuardadaSchema = z.object({ acciones: z.array(accionSchema).max(30) });

// ——— Buscar nombres entre los datos reales ———

/** Palabras sin tildes, mayúsculas ni signos: «Clara-Cerámica» → ["clara", "ceramica"]. */
const palabras = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
export const mismoNombre = (a: string, b: string) => palabras(a).join(' ') === palabras(b).join(' ');

export type Busqueda<T> = { tipo: 'una'; valor: T } | { tipo: 'varias'; opciones: T[] } | { tipo: 'ninguna' };

/**
 * Busca un nombre en una lista: primero la coincidencia exacta (sin tildes ni mayúsculas) y, si no hay,
 * las que empiezan por esas palabras («iris» encuentra «Iris Pérez», pero «ana» no encuentra «Mariana»).
 */
export function buscarNombre<T>(lista: T[], texto: string, nombres: (x: T) => (string | null | undefined)[]): Busqueda<T> {
  const buscadas = palabras(texto);
  if (buscadas.length === 0) return { tipo: 'ninguna' };
  const resultado = (encontradas: T[]): Busqueda<T> | null =>
    encontradas.length === 1 ? { tipo: 'una', valor: encontradas[0] } : encontradas.length > 1 ? { tipo: 'varias', opciones: encontradas } : null;
  const exactas = lista.filter((x) => nombres(x).some((n) => n && palabras(n).join(' ') === buscadas.join(' ')));
  const parecidas = lista.filter((x) => nombres(x).some((n) => {
    const suyas = n ? palabras(n) : [];
    return suyas.length > 0 && buscadas.every((b) => suyas.some((s) => s.startsWith(b)));
  }));
  return resultado(exactas) ?? resultado(parecidas) ?? { tipo: 'ninguna' };
}

/** «A, B o C» */
const lista = (textos: string[]) => (textos.length < 2 ? textos.join('') : `${textos.slice(0, -1).join(', ')} o ${textos.at(-1)}`);

type FilaTallerista = { id: number; nombre: string; marca: string | null; estado: string };
const nombreTallerista = (t: FilaTallerista) => (t.marca ? `${t.nombre} (${t.marca})` : t.nombre);

export async function buscarTallerista(nombre: string) {
  const filas = await todos<FilaTallerista>('SELECT id, nombre, marca, estado FROM talleristas ORDER BY id');
  return buscarNombre(filas, nombre, (t) => [t.nombre, t.marca]);
}

type FilaTaller = { id: number; titulo: string | null; fecha: string; franja: string; estado: string; tallerista_id: number | null; quien: string | null };
const nombreTaller = (t: FilaTaller) => `${t.titulo ? `«${t.titulo}»` : 'sin título'} (${DIA(t.fecha)}, ${FRANJAS[t.franja]?.toLowerCase() ?? ''})`;

/** Talleres de hoy en adelante, por título, por fecha (AAAA-MM-DD) o por quién lo da. */
export async function buscarTaller(ref: string): Promise<Busqueda<FilaTaller>> {
  const filas = await todos<FilaTaller>(`
    SELECT t.id, t.titulo, t.fecha, t.franja, t.estado, t.tallerista_id, COALESCE(ta.marca, ta.nombre) AS quien
    FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id WHERE t.fecha >= ?1 ORDER BY t.fecha`, hoyEspana());
  const delDia = filas.filter((t) => t.fecha === ref.trim());
  if (delDia.length === 1) return { tipo: 'una', valor: delDia[0] };
  if (delDia.length > 1) return { tipo: 'varias', opciones: delDia };
  const porTitulo = buscarNombre(filas, ref, (t) => [t.titulo]);
  return porTitulo.tipo === 'ninguna' ? buscarNombre(filas, ref, (t) => [t.quien]) : porTitulo;
}

type FilaSolicitud = { id: number; nombre: string; tipo: string };
async function buscarSolicitud(persona: string) {
  const filas = await todos<FilaSolicitud>(`SELECT id, nombre, tipo FROM solicitudes WHERE estado <> 'cerrada' ORDER BY id`);
  return buscarNombre(filas, persona, (s) => [s.nombre]);
}

type FilaPendiente = { id: number; nombre: string; nombre_menor: string | null; que: string; cuando: string | null };
const nombrePendiente = (r: FilaPendiente) => `${r.nombre_menor ? `${r.nombre_menor} (${r.nombre})` : r.nombre} · ${r.que}${r.cuando ? ` ${r.cuando}` : ''}`;

/** Reservas pendientes de pago (talleres y clases) de una persona; con `que`, solo las de ese taller o clase. */
export async function buscarReservaPendiente(persona: string, que: string | null) {
  await liberarCaducadas();
  const filas = await todos<FilaPendiente>(`
    SELECT r.id, r.nombre, r.nombre_menor, COALESCE(t.titulo, c.nombre, 'Taller') AS que, COALESCE(t.fecha, r.fecha_sesion, r.mes) AS cuando
    FROM reservas r LEFT JOIN talleres t ON t.id = r.taller_id
    LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id
    WHERE r.estado = 'pendiente' ORDER BY r.creado_en`);
  const r = buscarNombre(filas, persona, (f) => [f.nombre, f.nombre_menor]);
  if (!que || r.tipo === 'ninguna') return r;
  const candidatas = r.tipo === 'una' ? [r.valor] : r.opciones;
  const filtradas = buscarNombre(candidatas, que, (f) => [f.que]);
  return filtradas.tipo === 'ninguna' ? r : filtradas;
}

/** El horario de una clase a partir de lo que se ha dicho: clase, día y hora (cada uno puede faltar). */
export function buscarHorario(horarios: HorarioRef[], a: { clase: string | null; dia: string | null; hora: string | null }): Busqueda<HorarioRef> {
  let candidatos = horarios;
  if (a.clase) {
    const clase = buscarNombre([...new Set(horarios.map((h) => h.nombre))], a.clase, (n) => [n]);
    if (clase.tipo === 'ninguna') return clase;
    const nombres = clase.tipo === 'una' ? [clase.valor] : clase.opciones;
    candidatos = candidatos.filter((h) => nombres.includes(h.nombre));
  }
  const dia = a.dia ? diaDe(a.dia) : null;
  if (dia) candidatos = candidatos.filter((h) => h.dia_semana === dia);
  if (a.hora) candidatos = candidatos.filter((h) => h.hora_inicio === horaDe(a.hora!));
  return candidatos.length === 1 ? { tipo: 'una', valor: candidatos[0] }
    : candidatos.length > 1 ? { tipo: 'varias', opciones: candidatos } : { tipo: 'ninguna' };
}

// ——— Describir ———

type CamposTaller = { titulo: string | null; hora_inicio: string | null; hora_fin: string | null; precio_euros: number | null; plazas: number | null; texto: string | null; materiales: string | null; datos_pago: string | null };

const DIA = (f: string) => new Date(`${f}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const POR_LA = (m: 'manana' | 'tarde') => (m === 'manana' ? 'mañana' : 'tarde');
const juntar = (partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(' · ');
/** « · a · b» o nada, para añadir detalles al final de una frase. */
const mas = (partes: (string | false | null | undefined)[]) => (juntar(partes) ? ` · ${juntar(partes)}` : '');

function detalles(a: CamposTaller) {
  return juntar([
    a.titulo && `"${a.titulo}"`,
    a.hora_inicio && a.hora_fin && `${a.hora_inicio}-${a.hora_fin}`,
    a.precio_euros != null && `${a.precio_euros} €`,
    a.plazas != null && `${a.plazas} plazas`,
    a.materiales,
    a.datos_pago && `pago: ${a.datos_pago}`,
    a.texto && `texto: "${a.texto.length > 80 ? `${a.texto.slice(0, 80)}…` : a.texto}"`,
  ]);
}

/** Frase para que Iris revise cada acción antes de aplicarla. */
export function describir(a: Accion): string {
  switch (a.tipo) {
    case 'crear_tallerista':
      return `Añadir la tallerista ${a.nombre}${a.marca ? ` (${a.marca})` : ''}: ${ESTADOS_TALLERISTA[a.estado ?? 'aceptada']}${
        mas([a.categoria, a.instagram, a.email, a.telefono, a.propuesta && `propone: "${a.propuesta}"`, a.nota && `nota: "${a.nota}"`])}`;
    case 'crear_hueco':
      return `Crear un hueco libre el ${DIA(a.fecha)} por la ${POR_LA(a.momento)}, para ${a.tallerista ?? 'Yutori (tú)'}${a.plazas != null ? ` · ${a.plazas} plazas` : ''}`;
    case 'crear_taller': {
      const d = detalles(a);
      return `Crear taller el ${DIA(a.fecha)} por la ${POR_LA(a.momento)}, con ${a.tallerista ?? 'Yutori (tú)'}${d ? ` · ${d}` : ''}`;
    }
    case 'editar_taller': return `Cambiar el taller "${a.taller}": ${detalles(a) || 'nada'}`;
    case 'publicar_taller': return `Publicar el taller "${a.taller}"`;
    case 'desactivar_taller': return `Desactivar el taller "${a.taller}" (quitarlo de la web)`;
    case 'pago_tallerista': return `Taller "${a.taller}": 25 € de la reserva del espacio recibidos`;
    case 'estado_tallerista': return `Tallerista ${a.tallerista}: ${ESTADOS_TALLERISTA[a.estado]}${a.nota ? ` · nota: "${a.nota}"` : ''}`;
    case 'crear_peticion':
      return `Nueva petición de ${a.peticion === 'privado' ? 'taller privado' : 'bono regalo'} de ${a.nombre}${mas([
        a.email, a.telefono, a.motivo, a.categoria, a.fecha_aprox && DIA(a.fecha_aprox), a.personas != null && `${a.personas} personas`,
        a.tipo_bono && (a.tipo_bono === 'taller' ? 'bono para un taller' : 'bono por importe'), a.detalle,
        a.para_quien && `para ${a.para_quien}`, a.nota && `nota: "${a.nota}"`])}`;
    case 'estado_solicitud': return `Petición de ${a.persona}: ${ESTADOS_SOLICITUD[a.estado]}${a.nota ? ` · nota: "${a.nota}"` : ''}`;
    case 'apuntar_alumna': {
      const quien = a.nombre_menor ? `${a.nombre_menor} (${a.nombre})` : a.nombre;
      const horario = juntar([a.clase, a.dia && a.hora ? `${a.dia} ${a.hora}` : a.dia ?? a.hora]);
      return `Apuntar a ${quien} a ${horario || 'clase'}${mas([a.mes && nombreMes(a.mes), a.modalidad, a.telefono, a.email,
        a.pagado === false ? 'pendiente de pago' : 'mes pagado'])}`;
    }
    case 'pago_alumna': return `Pago recibido de ${a.persona}${a.que ? ` (${a.que})` : ''}`;
  }
}

// ——— Comprobar los datos (las mismas reglas que los formularios del panel) ———

// mapearTallerista() y mapearSolicitud() exigen email (y propuesta): aquí son opcionales. Se les pasa un valor de relleno
// para reutilizar el resto de sus reglas (email válido, categoría existente, estados…) y después se guarda vacío.
const RELLENO_EMAIL = 'relleno@yutori.invalid';

/** Datos de la tallerista listos para guardar. Solo el nombre es obligatorio (el email y la propuesta se rellenan después). */
async function datosTallerista(a: Extract<Accion, { tipo: 'crear_tallerista' }>) {
  const email = a.email?.trim() ?? '';
  const m = mapearTallerista({
    nombre: a.nombre.trim(), marca: a.marca ?? '', instagram: a.instagram ?? '', email: email || RELLENO_EMAIL, telefono: a.telefono ?? '',
    categoria: a.categoria ?? '', propuesta: a.propuesta || '-', estado: a.estado ?? 'aceptada', notas: a.nota ?? '',
  }, await mapaCategorias());
  const errores = m.errores.map((e) => (e === 'falta «nombre»' ? 'falta el nombre' : e));
  return { errores, datos: m.datos ? { ...m.datos, email, propuesta: a.propuesta ?? '' } : null };
}

/** Datos de una petición listos para guardar. Basta con el email o el teléfono (muchas llegan por WhatsApp). */
async function datosPeticion(a: Extract<Accion, { tipo: 'crear_peticion' }>) {
  const email = a.email?.trim() ?? '';
  const m = mapearSolicitud({
    tipo: a.peticion, nombre: a.nombre.trim(), email: email || (a.telefono ? RELLENO_EMAIL : ''), telefono: a.telefono ?? '',
    motivo: a.motivo ?? '', categoria: a.categoria ?? '', fecha_aprox: a.fecha_aprox ?? '', personas: a.personas != null ? String(a.personas) : '',
    tipo_bono: a.tipo_bono ?? '', detalle: a.detalle ?? '', para_quien: a.para_quien ?? '', estado: 'en_curso', notas: a.nota ?? '',
  }, await mapaCategorias());
  return { errores: m.errores, datos: m.datos ? { ...m.datos, email } : null };
}

function datosAlumna(a: Extract<Accion, { tipo: 'apuntar_alumna' }>, h: HorarioRef) {
  return mapearAlumna({
    grupo_id: String(h.id), nombre: a.nombre.trim(), telefono: a.telefono?.trim() ?? '', email: a.email?.trim() ?? '',
    nombre_menor: a.nombre_menor ?? '', modalidad: a.modalidad ?? '', mes: a.mes ?? '', estado: a.pagado === false ? 'pendiente' : 'pagado',
  }, [h]);
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

/** Por qué no se puede poner un taller ese día (o null si se puede). Mismas reglas que crearHueco(). */
async function problemaFecha(f: string, m: 'manana' | 'tarde') {
  if (!esFecha(f)) return 'No me queda clara la fecha. ¿Qué día es?';
  if (f < hoyEspana()) return `El ${DIA(f)} ya ha pasado. ¿Qué día lo pongo?`;
  const posibles = franjasDeFecha(f);
  if (posibles.length === 0) return `El ${DIA(f)} no hay talleres (son viernes por la tarde, sábados y domingos). ¿Qué día lo pongo?`;
  const franja = posibles.find((x) => x.endsWith(m));
  if (!franja) return `Los viernes solo hay talleres por la tarde. ¿Lo pongo el ${DIA(f)} por la tarde?`;
  const ocupada = await uno(`SELECT id FROM talleres WHERE fecha = ?1 AND franja = ?2 AND estado <> 'desactivado'`, f, franja);
  if (ocupada) return `El ${DIA(f)} por la ${POR_LA(m)} ya hay un taller. ¿Lo pongo en otro momento?`;
  return null;
}

/** Errores de las validaciones del panel convertidos en una pregunta corta. */
const preguntaDe = (quien: string, errores: string[]) =>
  `${quien}: ${errores.join('; ').replace(/\.$/, '')}. ¿Me lo dices?`;

// ——— Revisar lo que propone la IA antes de enseñarlo ———

export type Propuesta = { accion: Accion; aviso: string | null; marcada: boolean };
export type Revision = { pregunta: string | null; propuestas: Propuesta[] };

/**
 * Comprueba cada acción contra los datos reales antes de la vista previa: completa lo que falta (si la tallerista
 * no existe, propone crearla antes), escribe los nombres tal y como están guardados y, si algo es ambiguo
 * o falta un dato obligatorio, devuelve UNA pregunta corta en vez de fallar.
 */
export async function revisar(acciones: Accion[]): Promise<Revision> {
  const propuestas: Propuesta[] = [];
  const preguntar = (pregunta: string): Revision => ({ pregunta, propuestas: [] });
  const poner = (accion: Accion, aviso: string | null = null, marcada = true) => propuestas.push({ accion, aviso, marcada });
  const nuevaEnEstePlan = (nombre: string) => propuestas.some(({ accion: p }) => p.tipo === 'crear_tallerista'
    && (mismoNombre(p.nombre, nombre) || (p.marca != null && mismoNombre(p.marca, nombre))));
  let horarios: HorarioRef[] | null = null;

  for (const a of acciones) {
    switch (a.tipo) {
      case 'crear_taller':
      case 'crear_hueco': {
        const problema = await problemaFecha(a.fecha, a.momento);
        if (problema) return preguntar(problema);
        if (a.tipo === 'crear_taller') {
          const { errores } = cambiosTaller(a);
          if (errores.length) return preguntar(preguntaDe('Para el taller', errores));
        }
        if (!a.tallerista || nuevaEnEstePlan(a.tallerista)) { poner(a); break; }
        const t = await buscarTallerista(a.tallerista);
        if (t.tipo === 'varias') return preguntar(`¿Qué tallerista es: ${lista(t.opciones.map(nombreTallerista))}?`);
        if (t.tipo === 'ninguna') {
          poner({ tipo: 'crear_tallerista', nombre: a.tallerista, marca: null, instagram: null, email: null, telefono: null,
            categoria: null, propuesta: null, estado: 'aceptada', nota: null }, `No tienes a «${a.tallerista}» en tus talleristas: la añado primero.`);
          poner(a);
          break;
        }
        if (t.valor.estado !== 'aceptada') {
          poner({ tipo: 'estado_tallerista', tallerista: t.valor.nombre, estado: 'aceptada', nota: null },
            `Ahora está «${ESTADOS_TALLERISTA[t.valor.estado]}»: para darle fecha tiene que estar aceptada.`);
        }
        poner({ ...a, tallerista: t.valor.nombre });
        break;
      }
      case 'crear_tallerista': {
        const { errores } = await datosTallerista(a);
        if (errores.length) return preguntar(preguntaDe(`Para añadir a ${a.nombre || 'la tallerista'}`, errores));
        const ya = await buscarTallerista(a.nombre);
        const repetida = ya.tipo === 'una' && mismoNombre(ya.valor.nombre, a.nombre) ? ya.valor : null;
        if (repetida) poner(a, `Ya tienes una tallerista llamada ${repetida.nombre} (${ESTADOS_TALLERISTA[repetida.estado]}). Márcalo solo si es otra persona.`, false);
        else poner(a);
        break;
      }
      case 'estado_tallerista': {
        if (nuevaEnEstePlan(a.tallerista)) { poner(a); break; }
        const t = await buscarTallerista(a.tallerista);
        if (t.tipo === 'varias') return preguntar(`¿A qué tallerista te refieres: ${lista(t.opciones.map(nombreTallerista))}?`);
        if (t.tipo === 'ninguna') {
          // «Añade a Iris como aceptada»: si no existe, se crea en vez de fallar.
          poner({ tipo: 'crear_tallerista', nombre: a.tallerista, marca: null, instagram: null, email: null, telefono: null,
            categoria: null, propuesta: null, estado: a.estado, nota: a.nota }, `No tenías a «${a.tallerista}»: la añado como tallerista nueva.`);
          break;
        }
        poner({ ...a, tallerista: t.valor.nombre });
        break;
      }
      case 'editar_taller':
      case 'publicar_taller':
      case 'desactivar_taller':
      case 'pago_tallerista': {
        const t = await buscarTaller(a.taller);
        if (t.tipo === 'varias') return preguntar(`¿Qué taller: ${lista(t.opciones.map(nombreTaller))}?`);
        if (t.tipo === 'ninguna') {
          const proximos = await todos<FilaTaller>(`SELECT id, titulo, fecha, franja, estado, tallerista_id, NULL AS quien
            FROM talleres WHERE fecha >= ?1 AND estado <> 'desactivado' ORDER BY fecha LIMIT 5`, hoyEspana());
          return preguntar(`No encuentro el taller «${a.taller}». ${proximos.length ? `¿Es alguno de estos: ${lista(proximos.map(nombreTaller))}?` : 'No hay talleres próximos.'}`);
        }
        if (a.tipo === 'editar_taller') {
          const { errores } = cambiosTaller(a);
          if (errores.length) return preguntar(preguntaDe('Para el taller', errores));
        }
        const ref = t.valor.titulo ?? t.valor.fecha;
        if (a.tipo === 'pago_tallerista' && !t.valor.tallerista_id) {
          poner({ ...a, taller: ref }, 'Ese taller lo das tú: no hay reserva del espacio que cobrar.', false);
        } else poner({ ...a, taller: ref });
        break;
      }
      case 'estado_solicitud': {
        const s = await buscarSolicitud(a.persona);
        if (s.tipo === 'varias') return preguntar(`¿Qué petición: ${lista(s.opciones.map((x) => `${x.nombre} (${x.tipo === 'privado' ? 'privado' : 'bono'})`))}?`);
        if (s.tipo === 'ninguna') return preguntar(`No encuentro ninguna petición abierta de «${a.persona}». ¿Quieres que la cree?`);
        poner({ ...a, persona: s.valor.nombre });
        break;
      }
      case 'crear_peticion': {
        if (!a.email && !a.telefono) return preguntar(`¿Tienes el email o el teléfono de ${a.nombre}?`);
        if (a.peticion === 'bono' && !a.tipo_bono) return preguntar('¿El bono es para un taller concreto o por un importe?');
        const { errores } = await datosPeticion(a);
        if (errores.length) return preguntar(preguntaDe(`Para la petición de ${a.nombre}`, errores));
        poner(a);
        break;
      }
      case 'apuntar_alumna': {
        horarios ??= await horariosActivos();
        const h = buscarHorario(horarios, a);
        if (h.tipo === 'varias') return preguntar(`¿A qué horario: ${lista(h.opciones.map(horarioTexto))}?`);
        if (h.tipo === 'ninguna') {
          return preguntar(horarios.length ? `No encuentro ese horario. ¿Es alguno de estos: ${lista(horarios.map(horarioTexto))}?` : 'No hay horarios de clases activos.');
        }
        if (!a.telefono) return preguntar(`¿Cuál es el teléfono de ${a.nombre}?`);
        const m = datosAlumna(a, h.valor);
        if (m.errores.length) return preguntar(preguntaDe(`Para apuntar a ${a.nombre}`, m.errores));
        const listo = { ...a, clase: h.valor.nombre, dia: DIAS[h.valor.dia_semana].toLowerCase(), hora: h.valor.hora_inicio, mes: m.datos!.mes as string };
        const ya = await uno(`SELECT id FROM reservas WHERE tipo = 'clase_mensual' AND grupo_id = ?1 AND mes = ?2
          AND lower(nombre) = lower(?3) AND COALESCE(lower(nombre_menor), '') = COALESCE(lower(?4), '') AND estado IN ('pendiente', 'confirmada')`,
          h.valor.id, listo.mes, a.nombre.trim(), a.nombre_menor);
        if (ya) poner(listo, 'Ya estaba apuntada ese mes.', false);
        else poner(listo);
        break;
      }
      case 'pago_alumna': {
        const r = await buscarReservaPendiente(a.persona, a.que);
        if (r.tipo === 'varias') return preguntar(`¿Qué reserva: ${lista(r.opciones.map(nombrePendiente))}?`);
        if (r.tipo === 'ninguna') return preguntar(`No veo ninguna reserva pendiente de pago de «${a.persona}». ¿Cómo se llama exactamente?`);
        poner({ ...a, persona: r.valor.nombre_menor ?? r.valor.nombre, que: r.valor.que });
        break;
      }
    }
  }
  return { pregunta: null, propuestas };
}

// ——— Aplicar (se vuelve a comprobar todo: los datos llegan del navegador) ———

/** Inserta una fila con las columnas que ha preparado el propio código (nunca nombres de columna del usuario). */
async function insertar(tabla: 'talleristas' | 'solicitudes', datos: Record<string, unknown>) {
  const columnas = Object.keys(datos);
  const fila = await db()
    .prepare(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `?${i + 1}`).join(', ')}) RETURNING id`)
    .bind(...Object.values(datos))
    .first<{ id: number }>();
  return fila!.id;
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

const conNota = (tabla: 'talleristas' | 'solicitudes') =>
  `UPDATE ${tabla} SET estado = ?1, notas = CASE WHEN ?2 IS NULL THEN notas ELSE TRIM(COALESCE(notas || char(10), '') || ?2) END WHERE id = ?3`;

export type Resultado = { texto: string; ok: boolean; enlace?: string };

export async function aplicar(a: Accion): Promise<Resultado> {
  const texto = describir(a);
  const fallo = (motivo: string): Resultado => ({ texto: `${texto} — ${motivo}`, ok: false });
  const hecho = (enlace: string): Resultado => ({ texto, ok: true, enlace });

  switch (a.tipo) {
    case 'crear_tallerista': {
      const { errores, datos } = await datosTallerista(a);
      if (!datos) return fallo(errores.join('; '));
      return hecho(`/panel/talleristas/${await insertar('talleristas', datos)}`);
    }
    case 'crear_hueco':
    case 'crear_taller': {
      let talleristaId: number | null = null;
      if (a.tallerista) {
        const t = await buscarTallerista(a.tallerista);
        if (t.tipo !== 'una') return fallo(`no encuentro una sola tallerista llamada "${a.tallerista}".`);
        if (t.valor.estado !== 'aceptada') return fallo(`${t.valor.nombre} no está aceptada.`);
        talleristaId = t.valor.id;
      }
      const { errores, campos } = a.tipo === 'crear_taller' ? cambiosTaller(a) : { errores: [], campos: [] };
      if (errores.length) return fallo(errores.join(' '));
      const hueco = await crearHueco({ talleristaId, fecha: a.fecha, momento: a.momento, plazas: a.plazas ?? 8 });
      if (!hueco.ok) return fallo(hueco.errores.join(' '));
      await guardarCambios(hueco.valor, campos.filter(([k]) => k !== 'plazas'));
      return hecho(`/panel/talleres/${hueco.valor}`);
    }
    case 'editar_taller': {
      const t = await buscarTaller(a.taller);
      if (t.tipo !== 'una') return fallo('no encuentro ese taller (o hay varios que se parecen).');
      if (t.valor.estado === 'publicado' && (a.plazas != null || a.precio_euros != null)) {
        const reservas = await uno<{ n: number }>(`SELECT count(*) AS n FROM reservas WHERE taller_id = ?1 AND estado IN ('pendiente', 'confirmada')`, t.valor.id);
        if ((reservas?.n ?? 0) > 0) return fallo('ya tiene reservas: cambia el precio o las plazas desde su ficha para revisarlo con calma.');
      }
      const { errores, campos } = cambiosTaller(a);
      if (errores.length) return fallo(errores.join(' '));
      await guardarCambios(t.valor.id, campos);
      return hecho(`/panel/talleres/${t.valor.id}`);
    }
    case 'publicar_taller': {
      const t = await buscarTaller(a.taller);
      if (t.tipo !== 'una') return fallo('no encuentro ese taller.');
      const r = await publicarTaller(t.valor.id);
      return r.ok ? hecho(`/panel/talleres/${t.valor.id}`) : fallo(r.errores.join(' '));
    }
    case 'desactivar_taller': {
      const t = await buscarTaller(a.taller);
      if (t.tipo !== 'una') return fallo('no encuentro ese taller.');
      await desactivarTaller(t.valor.id);
      return hecho(`/panel/talleres/${t.valor.id}`);
    }
    case 'pago_tallerista': {
      const t = await buscarTaller(a.taller);
      if (t.tipo !== 'una') return fallo('no encuentro ese taller.');
      if (!t.valor.tallerista_id) return fallo('ese taller lo das tú: no hay reserva del espacio que cobrar.');
      await marcarPagoReserva(t.valor.id); // si ya estaba marcado, no cambia nada
      return hecho(`/panel/talleres/${t.valor.id}`);
    }
    case 'estado_tallerista': {
      const t = await buscarTallerista(a.tallerista);
      if (t.tipo !== 'una') return fallo(`no encuentro a "${a.tallerista}" (o hay varias que se parecen).`);
      await db().prepare(conNota('talleristas')).bind(a.estado, a.nota, t.valor.id).run();
      return hecho(`/panel/talleristas/${t.valor.id}`);
    }
    case 'crear_peticion': {
      const { errores, datos } = await datosPeticion(a);
      if (!datos) return fallo(errores.join('; '));
      return hecho(`/panel/solicitudes/${await insertar('solicitudes', datos)}`);
    }
    case 'estado_solicitud': {
      const s = await buscarSolicitud(a.persona);
      if (s.tipo !== 'una') return fallo(`no encuentro una sola petición abierta de "${a.persona}".`);
      await db().prepare(conNota('solicitudes')).bind(a.estado, a.nota, s.valor.id).run();
      return hecho(`/panel/solicitudes/${s.valor.id}`);
    }
    case 'apuntar_alumna': {
      const h = buscarHorario(await horariosActivos(), a);
      if (h.tipo !== 'una') return fallo('no encuentro un solo horario con esos datos.');
      const m = datosAlumna(a, h.valor);
      if (!m.datos) return fallo(m.errores.join('; '));
      const d = m.datos as { mes: string; nombre: string; telefono: string; email: string; modalidad: string | null; nombre_menor: string | null; estado: 'confirmada' | 'pendiente' };
      const id = await apuntarAlumnaMes(h.valor.id, d.mes, { nombre: d.nombre, telefono: d.telefono, email: d.email, modalidad: d.modalidad, menor: d.nombre_menor }, d.estado);
      if (!id) return fallo(`ya estaba apuntada o no quedan plazas en ${horarioTexto(h.valor)} en ${nombreMes(d.mes)}.`);
      return hecho(`/panel/clases?mes=${d.mes}`);
    }
    case 'pago_alumna': {
      const r = await buscarReservaPendiente(a.persona, a.que);
      if (r.tipo !== 'una') return fallo(`no encuentro una sola reserva pendiente de pago de "${a.persona}".`);
      await cambiarEstadoReserva(r.valor.id, 'pagado');
      const ahora = await uno<{ estado: string }>('SELECT estado FROM reservas WHERE id = ?1', r.valor.id);
      return ahora?.estado === 'confirmada' ? hecho(`/panel/reservas/${r.valor.id}`) : fallo('esa reserva ya no está pendiente.');
    }
  }
}
