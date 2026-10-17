// Portada «Hoy» del panel: qué tiene que hacer Iris, ordenado por urgencia, y la agenda de la semana.
// Todo sale de los datos reales (sin estados nuevos). «Hoy» es siempre la fecha de España (hoyEspana), nunca date('now').
import { todos, uno, eurosCorto } from './db';
import { cambiarEstadoReserva, hoyEspana, liberarCaducadas, PLAZO_PAGO_HORAS } from './reservas';
import { publicarTaller } from './talleres';
import { DIA_APERTURA, gruposActivos, meses, renovarMes } from './clases';
import { cambiarEstadoSolicitud, cambiarEstadoTallerista, marcarPagoReserva } from './acciones';
import { diaSemana, telefonoWhatsApp } from './util';

export type Bloque = 'urgente' | 'semana' | 'cuando';
export const BLOQUES: { clave: Bloque; titulo: string }[] = [
  { clave: 'urgente', titulo: 'Urgente' },
  { clave: 'semana', titulo: 'Esta semana' },
  { clave: 'cuando', titulo: 'Cuando puedas' },
];
/** Líneas que enseña cada bloque antes del «Ver las N». */
export const MAX_POR_BLOQUE = 5;
/** Días que faltan para un taller o una petición para considerarlos «cerca». */
const DIAS_CERCA = 7;
/** Una petición nueva sin atender más de estos días pasa a urgente. */
const DIAS_PETICION_URGENTE = 2;

export type Accion =
  | { tipo: 'post'; accion: string; etiqueta: string; campos: Record<string, string | number> }
  | { tipo: 'enlace'; etiqueta: string; href: string; externo?: boolean };

export type Tarea = {
  /** Identifica la tarea de forma estable (código + id), p. ej. `T1-12`. */
  clave: string;
  codigo: string;
  bloque: Bloque;
  texto: string;
  /** El mismo texto sin lo que ya dice el título de su grupo (para cuando varias tareas comparten taller o clase). */
  textoCorto: string;
  href: string;
  principal: Accion;
  secundaria?: Accion;
  grupo: { clave: string; titulo: string } | null;
  /** Solo informa (no se puede hacer nada): no cuenta en los pendientes. */
  informativa: boolean;
  peso: number;
  orden: string;
};

// ---------- Fechas ----------

const aUTC = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const aISO = (f: Date) => f.toISOString().slice(0, 10);

export const sumarDias = (iso: string, n: number) => aISO(new Date(aUTC(iso).getTime() + n * 86_400_000));
/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export const diasEntre = (desde: string, hasta: string) => Math.round((aUTC(hasta).getTime() - aUTC(desde).getTime()) / 86_400_000);

/** "sáb 24" (con el mes, "sáb 8 nov", si no es el mes en curso para que no haya dudas). */
export const diaCorto = (iso: string) => {
  const otroMes = iso.slice(0, 7) !== hoyEspana().slice(0, 7);
  return aUTC(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', ...(otroMes ? { month: 'short' } : {}), timeZone: 'UTC' }).replace(/[.,]/g, '');
};
/** "14 oct". */
const diaMes = (iso: string) => aUTC(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
/** "sábado 17 de octubre". */
export const diaLargo = (iso: string) => aUTC(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const nombreMesCorto = (mes: string) => new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });

/** Día (hora de España) de un momento guardado en UTC. */
const diaDeMomento = (momento: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(momento.endsWith('Z') ? momento : `${momento}Z`));
/** Momento en UTC con el formato de la base de datos. */
const momentoUTC = (f: Date) => f.toISOString().slice(0, 19);

const cuando = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);
const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

/** "le quedan 5 h" (o minutos si queda menos de una hora). */
function quedan(caducaEn: string, ahora: Date) {
  const min = Math.max(0, Math.ceil((new Date(`${caducaEn}Z`).getTime() - ahora.getTime()) / 60_000));
  return min < 60 ? `le quedan ${min} min` : `le quedan ${Math.floor(min / 60)} h`;
}

/** "90 €", "55-65 €" (rango) o "—" si no hay precio. */
function importe(cent: number | null, maxCent?: number | null) {
  if (cent == null) return '—';
  if (maxCent && maxCent > cent) return `${eurosCorto(cent).replace(' €', '')}-${eurosCorto(maxCent)}`;
  return eurosCorto(cent);
}

// ---------- Datos ----------

type FilaReserva = {
  id: number; tipo: 'taller' | 'clase_mensual' | 'clase_suelta'; nombre: string; plazas: number; caduca_en: string | null;
  mes: string | null; fecha_sesion: string | null; creado_en: string; taller_id: number | null; grupo_id: number | null;
  titulo: string | null; taller_fecha: string | null; taller_precio: number | null; clase: string | null;
  precio_mes_cent: number | null; precio_mes_max_cent: number | null; precio_suelta_cent: number | null;
};
type FilaTaller = {
  id: number; titulo: string | null; fecha: string; estado: string; pago_reserva_recibido: number; fecha_limite: string | null;
  tallerista_id: number | null; tallerista: string | null; telefono: string | null; email: string | null; codigo_enlace: string | null;
};
type FilaSolicitud = {
  id: number; tipo: 'privado' | 'bono'; nombre: string; motivo: string | null; personas: number | null; detalle: string | null;
  fecha_aprox: string | null; estado: string; creado_en: string;
};
type FilaTallerista = { id: number; nombre: string; categoria: string | null; creado_en: string };

export type DatosHoy = {
  pendientes: FilaReserva[];
  liberadas: FilaReserva[];
  talleres: FilaTaller[];
  solicitudes: FilaSolicitud[];
  talleristas: FilaTallerista[];
  /** Mensuales confirmadas del mes en curso y cuántas aún no tienen su plaza del mes siguiente. */
  renovacion: { confirmadas: number; sinRenovar: number };
};

const SELECT_RESERVA = `
  SELECT r.id, r.tipo, r.nombre, r.plazas, r.caduca_en, r.mes, r.fecha_sesion, r.creado_en, r.taller_id, r.grupo_id,
         t.titulo, t.fecha AS taller_fecha, t.precio_cent AS taller_precio, c.nombre AS clase,
         g.precio_mes_cent, g.precio_mes_max_cent, c.precio_suelta_cent
  FROM reservas r
  LEFT JOIN talleres t ON t.id = r.taller_id
  LEFT JOIN grupos g ON g.id = r.grupo_id
  LEFT JOIN clases c ON c.id = g.clase_id`;

/** Lee de la base de datos todo lo que hace falta para calcular las tareas (consultas ligeras, sin cálculos). */
export async function cargarDatos(hoy: string, ahora: Date): Promise<DatosHoy> {
  const { actual, siguiente } = meses();
  const hace7dias = momentoUTC(new Date(ahora.getTime() - 7 * 86_400_000));
  const [pendientes, liberadas, talleres, solicitudes, talleristas, renovacion] = await Promise.all([
    todos<FilaReserva>(`${SELECT_RESERVA} WHERE r.estado = 'pendiente' ORDER BY r.creado_en`),
    todos<FilaReserva>(`${SELECT_RESERVA} WHERE r.estado = 'liberada' AND r.caduca_en >= ?1 ORDER BY r.caduca_en DESC`, hace7dias),
    todos<FilaTaller>(`
      SELECT t.id, t.titulo, t.fecha, t.estado, t.pago_reserva_recibido, t.fecha_limite, t.tallerista_id,
             COALESCE(ta.marca, ta.nombre) AS tallerista, ta.telefono, ta.email, t.codigo_enlace
      FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id
      WHERE t.fecha >= ?1 AND t.estado IN ('hueco', 'enviado', 'publicado') ORDER BY t.fecha`, hoy),
    todos<FilaSolicitud>(`
      SELECT id, tipo, nombre, motivo, personas, detalle, fecha_aprox, estado, creado_en FROM solicitudes
      WHERE estado IN ('nueva', 'en_curso') ORDER BY creado_en`),
    todos<FilaTallerista>(`
      SELECT ta.id, ta.nombre, c.nombre AS categoria, ta.creado_en FROM talleristas ta
      LEFT JOIN categorias c ON c.id = ta.categoria_id WHERE ta.estado = 'nueva' ORDER BY ta.creado_en`),
    uno<{ confirmadas: number; sin_renovar: number }>(`
      SELECT count(*) AS confirmadas,
             sum(CASE WHEN NOT EXISTS (SELECT 1 FROM reservas x WHERE x.tipo = 'clase_mensual' AND x.mes = ?2 AND x.grupo_id = r.grupo_id
                  AND lower(x.email) = lower(r.email) AND lower(x.nombre) = lower(r.nombre) AND COALESCE(x.nombre_menor, '') = COALESCE(r.nombre_menor, '')
                  AND x.estado IN ('pendiente', 'confirmada')) THEN 1 ELSE 0 END) AS sin_renovar
      FROM reservas r WHERE r.tipo = 'clase_mensual' AND r.mes = ?1 AND r.estado = 'confirmada'`, actual, siguiente),
  ]);
  return {
    pendientes, liberadas, talleres, solicitudes, talleristas,
    renovacion: { confirmadas: renovacion?.confirmadas ?? 0, sinRenovar: renovacion?.sin_renovar ?? 0 },
  };
}

// ---------- Cálculo ----------

type Contexto = { hoy: string; ahora: Date; origen: string };

/** Qué es y cuándo es una reserva, para el texto y para decidir su urgencia. */
function describirReserva(r: FilaReserva) {
  if (r.tipo === 'taller') {
    const f = r.taller_fecha ?? '';
    const nombre = r.titulo ?? `Taller del ${f ? diaCorto(f) : 'día'}`;
    return {
      que: nombre, grupo: { clave: `t${r.taller_id}`, titulo: r.titulo ? `${r.titulo} · ${diaCorto(f)}` : nombre },
      fecha: f, mes: f.slice(0, 7), cent: r.taller_precio == null ? null : r.taller_precio * r.plazas, max: null as number | null,
      href: `/panel/talleres/${r.taller_id}#apuntadas`,
    };
  }
  const clase = r.clase ?? 'Clase';
  if (r.tipo === 'clase_suelta') {
    const f = r.fecha_sesion ?? '';
    return {
      que: `${clase}, clase del ${f ? diaCorto(f) : 'día'}`, grupo: { clave: `g${r.grupo_id}-${f}`, titulo: `${clase} · ${f ? diaCorto(f) : ''}` },
      fecha: f, mes: f.slice(0, 7), cent: r.precio_suelta_cent == null ? null : r.precio_suelta_cent * r.plazas, max: null as number | null,
      href: `/panel/reservas/${r.id}`,
    };
  }
  const mes = r.mes ?? '';
  return {
    que: `${clase}, ${mes ? nombreMesCorto(mes) : ''}`, grupo: { clave: `g${r.grupo_id}-${mes}`, titulo: `${clase} · ${mes ? nombreMesCorto(mes) : ''}` },
    fecha: '', mes, cent: r.precio_mes_cent, max: r.precio_mes_max_cent, href: `/panel/reservas/${r.id}`,
  };
}

function tareasDeReservas(filas: FilaReserva[], c: Contexto): Tarea[] {
  const manana = sumarDias(c.hoy, 1);
  const mesActual = c.hoy.slice(0, 7);
  return filas.map((r) => {
    const d = describirReserva(r);
    const plazas = r.plazas > 1 ? ` (${r.plazas} plazas)` : '';
    const cobro = importe(d.cent, d.max);
    const pasado = d.fecha !== '' && d.fecha < c.hoy;
    // Taller o clase suelta de hoy o de mañana: no se puede esperar.
    const inminente = d.fecha !== '' && d.fecha >= c.hoy && d.fecha <= manana;
    const base = { href: d.href, grupo: d.grupo, informativa: false, secundaria: undefined };
    const principal: Accion = { tipo: 'post', accion: 'pagado', etiqueta: 'Pago recibido', campos: { id: r.id } };

    if (r.caduca_en) {
      const plazo = quedan(r.caduca_en, c.ahora);
      // El plazo normal es de PLAZO_PAGO_HORAS: casi todas son urgentes; una con más margen (añadida a mano) espera.
      const horas = (new Date(`${r.caduca_en}Z`).getTime() - c.ahora.getTime()) / 3_600_000;
      const urgente = inminente || horas <= PLAZO_PAGO_HORAS + 1;
      return {
        ...base, clave: `T1-${r.id}`, codigo: 'T1', bloque: urgente ? 'urgente' : 'semana',
        texto: `${r.nombre} · ${d.que}${plazas} · ${cobro} · ${plazo}`,
        textoCorto: `${r.nombre}${plazas} · ${cobro} · ${plazo}`,
        principal, peso: 10, orden: r.caduca_en,
      } satisfies Tarea;
    }
    // Pendiente sin plazo (renovada o añadida a mano): no caduca, pero hay que cobrarla.
    const bloque: Bloque = inminente ? 'urgente' : pasado ? 'cuando' : d.mes === mesActual ? 'semana' : 'cuando';
    return {
      ...base, clave: `T2-${r.id}`, codigo: 'T2', bloque,
      texto: `${r.nombre} · ${d.que}${plazas} · ${cobro} · sin pagar${pasado ? ' · ya pasó' : ''}`,
      textoCorto: `${r.nombre}${plazas} · ${cobro} · sin pagar${pasado ? ' · ya pasó' : ''}`,
      principal, peso: inminente ? 15 : bloque === 'semana' ? 60 : 40, orden: r.creado_en,
    } satisfies Tarea;
  });
}

function tareasDeLiberadas(filas: FilaReserva[], c: Contexto): Tarea[] {
  return filas.flatMap((r) => {
    const d = describirReserva(r);
    // Una plaza liberada de algo que ya pasó no interesa.
    if ((d.fecha || `${d.mes}-31`) < c.hoy) return [];
    return [{
      clave: `T3-${r.id}`, codigo: 'T3', bloque: 'cuando', informativa: true, peso: 50, orden: r.caduca_en ?? r.creado_en,
      texto: `Se liberó la plaza de ${primerNombre(r.nombre)} (no pagó a tiempo) · ${d.que}`,
      textoCorto: `Se liberó la plaza de ${primerNombre(r.nombre)} (no pagó a tiempo)`,
      href: `/panel/reservas/${r.id}`, grupo: d.grupo,
      principal: { tipo: 'enlace', etiqueta: 'Abrir', href: `/panel/reservas/${r.id}` },
    } satisfies Tarea];
  });
}

function tareasDeSolicitudes(filas: FilaSolicitud[], c: Contexto): Tarea[] {
  const quien = (s: FilaSolicitud) => primerNombre(s.nombre);
  return filas.flatMap((s): Tarea[] => {
    const href = `/panel/solicitudes#s${s.id}`;
    const llegada = diasEntre(diaDeMomento(s.creado_en), c.hoy);
    const llego = llegada <= 0 ? 'llegó hoy' : llegada === 1 ? 'llegó ayer' : `llegó hace ${llegada} días`;
    const que = s.tipo === 'privado'
      ? `Taller privado de ${quien(s)} · ${[s.motivo?.toLowerCase(), s.personas ? `${s.personas} personas` : null].filter(Boolean).join(', ') || 'sin detalles'}`
      : `Bono regalo de ${quien(s)} · ${s.detalle ?? 'sin detalle'}`;

    if (s.estado === 'nueva') {
      const urgente = llegada > DIAS_PETICION_URGENTE;
      return [{
        clave: `T4-${s.id}`, codigo: 'T4', bloque: urgente ? 'urgente' : 'semana', informativa: false, grupo: null,
        texto: `${que} · ${llego}`, textoCorto: `${que} · ${llego}`, href,
        principal: { tipo: 'post', accion: 'en_curso', etiqueta: 'Pasar a en curso', campos: { id: s.id } },
        peso: urgente ? 30 : 10, orden: s.creado_en,
      }];
    }
    // En curso con fecha cerca: que no se pase.
    if (s.tipo === 'privado' && s.fecha_aprox) {
      const dias = diasEntre(c.hoy, s.fecha_aprox);
      if (dias >= 0 && dias <= 14) {
        return [{
          clave: `T5-${s.id}`, codigo: 'T5', bloque: 'semana', informativa: false, grupo: null, peso: 70, orden: s.fecha_aprox,
          texto: `${que} · es el ${diaCorto(s.fecha_aprox)} (${cuando(dias)})`, textoCorto: `${que} · es el ${diaCorto(s.fecha_aprox)}`, href,
          principal: { tipo: 'enlace', etiqueta: 'Abrir', href },
        }];
      }
    }
    return [];
  });
}

function tareasDeTalleristas(filas: FilaTallerista[]): Tarea[] {
  return filas.map((t) => {
    const texto = `Nueva tallerista: ${primerNombre(t.nombre)}${t.categoria ? ` · ${t.categoria}` : ''}`;
    return {
      clave: `T6-${t.id}`, codigo: 'T6', bloque: 'cuando', informativa: false, grupo: null, peso: 10, orden: t.creado_en,
      texto, textoCorto: texto, href: `/panel/talleristas/${t.id}`,
      principal: { tipo: 'post', accion: 'en_revision', etiqueta: 'En revisión', campos: { id: t.id } },
    } satisfies Tarea;
  });
}

function tareasDeTalleres(filas: FilaTaller[], c: Contexto): Tarea[] {
  const tareas: Tarea[] = [];
  for (const t of filas) {
    const dias = diasEntre(c.hoy, t.fecha);
    const cerca = dias <= DIAS_CERCA;
    const href = `/panel/talleres/${t.id}`;
    const dia = diaCorto(t.fecha);
    const grupo = { clave: `t${t.id}`, titulo: t.titulo ? `${t.titulo} · ${dia}` : `Taller del ${dia}${t.tallerista ? ` · ${t.tallerista}` : ''}` };
    const base = { href, grupo, informativa: false, orden: t.fecha };

    if (t.estado === 'enviado') {
      const texto = (t.tallerista ? `${t.tallerista} ha enviado su taller: ${t.titulo}` : `Taller listo para publicar: ${t.titulo}`) +
        (cerca ? ` · es el ${dia} (${cuando(dias)})` : '');
      tareas.push({
        ...base, clave: `T10-${t.id}`, codigo: 'T10', bloque: cerca ? 'urgente' : 'semana', texto,
        textoCorto: cerca ? `${t.tallerista ?? 'Tu taller'} lo ha enviado y aún no está publicado (${cuando(dias)})` : `${t.tallerista ?? 'Tu taller'} lo ha enviado`,
        principal: { tipo: 'post', accion: 'publicar', etiqueta: 'Publicar en la web', campos: { id: t.id } },
        peso: cerca ? 25 : 20,
      });
    }

    if (t.estado === 'hueco' && t.tallerista_id) {
      const fueraDePlazo = Boolean(t.fecha_limite && t.fecha_limite < c.hoy);
      const limiteCerca = Boolean(t.fecha_limite && diasEntre(c.hoy, t.fecha_limite) <= DIAS_CERCA);
      const bloque: Bloque = fueraDePlazo || cerca ? 'urgente' : limiteCerca ? 'semana' : 'cuando';
      const texto = `${t.tallerista} aún no ha rellenado su taller del ${dia}` +
        (fueraDePlazo ? ` · fuera de plazo desde el ${diaMes(t.fecha_limite!)}` : '');
      tareas.push({
        ...base, clave: `T7-${t.id}`, codigo: 'T7', bloque, texto,
        textoCorto: `Aún no lo ha rellenado${fueraDePlazo ? ` · fuera de plazo desde el ${diaMes(t.fecha_limite!)}` : ''}`,
        principal: recordatorio(t, c, href), orden: t.fecha_limite ?? t.fecha,
        peso: bloque === 'urgente' ? (fueraDePlazo ? 20 : 26) : bloque === 'semana' ? 50 : 30,
      });
    }

    if (t.estado === 'hueco' && !t.tallerista_id) {
      const texto = `Rellena tu taller del ${dia}${cerca ? ` (${cuando(dias)})` : ''}`;
      tareas.push({
        ...base, clave: `T8-${t.id}`, codigo: 'T8', bloque: cerca ? 'urgente' : 'cuando', texto, textoCorto: texto,
        principal: { tipo: 'enlace', etiqueta: 'Abrir', href }, peso: cerca ? 27 : 20,
      });
    }

    if (t.tallerista_id && !t.pago_reserva_recibido) {
      tareas.push({
        ...base, clave: `T9-${t.id}`, codigo: 'T9', bloque: 'semana', texto: `25 € de ${t.tallerista} · taller del ${dia}`,
        textoCorto: '25 € de la reserva sin recibir',
        principal: { tipo: 'post', accion: 'veinticinco', etiqueta: '25 € recibidos', campos: { id: t.id } }, peso: 30,
      });
    }
  }
  return tareas;
}

/** Botón de «Recordar»: WhatsApp si hay teléfono, email si no, y si no hay forma de avisarla, abre la ficha. */
function recordatorio(t: FilaTaller, c: Contexto, href: string): Accion {
  if (!t.codigo_enlace) return { tipo: 'enlace', etiqueta: 'Abrir', href };
  const enlace = `${c.origen}/t/${t.codigo_enlace}`;
  const dia = aUTC(t.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', timeZone: 'UTC' });
  const mensaje = `¡Hola! Te recuerdo que tienes pendiente rellenar los datos de tu taller del ${dia} aquí: ${enlace}. ¡Gracias! ✨`;
  const tel = telefonoWhatsApp(t.telefono);
  if (tel) return { tipo: 'enlace', etiqueta: 'Recordar por WhatsApp', href: `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, externo: true };
  if (t.email) {
    return { tipo: 'enlace', etiqueta: 'Recordar por email', href: `mailto:${t.email}?subject=${encodeURIComponent('Tu taller en Yutori')}&body=${encodeURIComponent(mensaje)}`, externo: true };
  }
  return { tipo: 'enlace', etiqueta: 'Abrir', href };
}

function tareaDeRenovacion(datos: DatosHoy, c: Contexto): Tarea[] {
  const { actual, siguiente } = meses();
  const dia = Number(c.hoy.slice(8, 10));
  if (dia < DIA_APERTURA || datos.renovacion.sinRenovar === 0) return [];
  const texto = `Renueva a tus alumnas para ${nombreMesCorto(siguiente)} (${datos.renovacion.confirmadas} confirmadas en ${nombreMesCorto(actual)})`;
  return [{
    clave: 'T12', codigo: 'T12', bloque: 'semana', informativa: false, grupo: null, peso: 40, orden: siguiente,
    texto, textoCorto: texto, href: '/panel/clases',
    principal: { tipo: 'post', accion: 'renovar', etiqueta: `Renovar alumnas (${datos.renovacion.sinRenovar})`, campos: { id: 0 } },
  }];
}

/** Construye las tareas a partir de los datos ya leídos (sin tocar la base de datos). */
export function construirTareas(datos: DatosHoy, c: Contexto): Tarea[] {
  return [
    ...tareasDeReservas(datos.pendientes, c),
    ...tareasDeLiberadas(datos.liberadas, c),
    ...tareasDeSolicitudes(datos.solicitudes, c),
    ...tareasDeTalleristas(datos.talleristas),
    ...tareasDeTalleres(datos.talleres, c),
    ...tareaDeRenovacion(datos, c),
  ];
}

/** Libera las reservas caducadas y calcula todas las tareas de hoy. */
export async function tareasDeHoy(origen = ''): Promise<Tarea[]> {
  await liberarCaducadas();
  const ahora = new Date();
  const hoy = hoyEspana();
  return construirTareas(await cargarDatos(hoy, ahora), { hoy, ahora, origen });
}

// ---------- Reparto en bloques ----------

export type GrupoDeTareas = { titulo: string | null; tareas: Tarea[] };
export type BloqueCalculado = {
  clave: Bloque; titulo: string;
  /** Pendientes de verdad (sin las informativas). */
  total: number;
  /** Todas las líneas del bloque, también las que no caben. */
  lineas: number;
  ocultas: number;
  grupos: GrupoDeTareas[];
};

/**
 * Reparte las tareas en los tres bloques, las ordena por urgencia, junta las del mismo taller o clase
 * y se queda con las primeras `max` (todas si `max` es Infinity). Los bloques vacíos no salen.
 */
export function repartir(tareas: Tarea[], max = MAX_POR_BLOQUE): BloqueCalculado[] {
  return BLOQUES.flatMap(({ clave, titulo }) => {
    const del = tareas.filter((t) => t.bloque === clave).sort((a, b) => a.peso - b.peso || a.orden.localeCompare(b.orden));
    if (del.length === 0) return [];
    const visibles = del.slice(0, max);
    const grupos: GrupoDeTareas[] = [];
    const porClave = new Map<string, GrupoDeTareas>();
    for (const t of visibles) {
      const existente = t.grupo ? porClave.get(t.grupo.clave) : undefined;
      if (existente) { existente.tareas.push(t); continue; }
      const nuevo: GrupoDeTareas = { titulo: null, tareas: [t] };
      if (t.grupo) { nuevo.titulo = t.grupo.titulo; porClave.set(t.grupo.clave, nuevo); }
      grupos.push(nuevo);
    }
    // Un grupo de una sola tarea no necesita título: la línea ya lo dice todo.
    for (const g of grupos) if (g.tareas.length === 1) g.titulo = null;
    return [{
      clave, titulo, total: del.filter((t) => !t.informativa).length, lineas: del.length, ocultas: del.length - visibles.length, grupos,
    }];
  });
}

export const contarPendientes = (tareas: Tarea[]) => tareas.filter((t) => !t.informativa).length;
export const contarUrgentes = (tareas: Tarea[]) => tareas.filter((t) => !t.informativa && t.bloque === 'urgente').length;

// ---------- Acciones de un toque ----------

export type ResultadoAccion = { ok: true; hecho: string; de: string } | { ok: false; errores: string[] };

/** «Hecho: …» que se enseña tras una acción. */
export function mensajeHecho(hecho: string, de: string) {
  switch (hecho) {
    case 'pago': return `Hecho: pago de ${de} recibido.`;
    case 'veinticinco': return `Hecho: 25 € de ${de} recibidos.`;
    case 'publicado': return `Hecho: taller publicado${de ? ` (${de})` : ''}.`;
    case 'curso': return `Hecho: petición de ${de} en curso.`;
    case 'revision': return `Hecho: ${de} en revisión.`;
    case 'renovadas': return Number(de) === 0 ? 'Hecho: no había alumnas por renovar.' : `Hecho: ${de} ${Number(de) === 1 ? 'alumna renovada' : 'alumnas renovadas'}, pendientes de pago.`;
    default: return null;
  }
}

/**
 * Ejecuta la acción de un toque de una tarea. Si ya estaba hecha (por ejemplo desde otro dispositivo) no da error.
 * Un fallo de email o de calendario nunca llega aquí: lo absorben avisos.ts y calendario.ts.
 */
export async function ejecutarAccion(accion: string, id: number): Promise<ResultadoAccion> {
  if (accion === 'renovar') {
    const { actual, siguiente } = meses();
    return { ok: true, hecho: 'renovadas', de: String(await renovarMes(actual, siguiente)) };
  }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, errores: ['No encuentro esa tarea.'] };

  if (accion === 'pagado') {
    const r = await uno<{ nombre: string; estado: string }>('SELECT nombre, estado FROM reservas WHERE id = ?1', id);
    if (!r) return { ok: false, errores: ['Esa reserva ya no existe.'] };
    await cambiarEstadoReserva(id, 'pagado');
    const despues = await uno<{ estado: string }>('SELECT estado FROM reservas WHERE id = ?1', id);
    // Una plaza liberada no se puede confirmar: puede tenerla ya otra persona.
    if (despues?.estado === 'liberada') return { ok: false, errores: [`La plaza de ${primerNombre(r.nombre)} ya se había liberado: no se puede confirmar.`] };
    if (despues?.estado === 'cancelada') return { ok: false, errores: [`La reserva de ${primerNombre(r.nombre)} está cancelada.`] };
    return { ok: true, hecho: 'pago', de: primerNombre(r.nombre) };
  }
  if (accion === 'veinticinco') {
    const t = await uno<{ tallerista: string | null }>(
      `SELECT COALESCE(ta.marca, ta.nombre) AS tallerista FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id WHERE t.id = ?1`, id);
    if (!t) return { ok: false, errores: ['Ese taller ya no existe.'] };
    await marcarPagoReserva(id, true);
    return { ok: true, hecho: 'veinticinco', de: t.tallerista ?? 'la tallerista' };
  }
  if (accion === 'publicar') {
    const t = await uno<{ titulo: string | null }>('SELECT titulo FROM talleres WHERE id = ?1', id);
    const r = await publicarTaller(id);
    return r.ok ? { ok: true, hecho: 'publicado', de: t?.titulo ?? '' } : r;
  }
  if (accion === 'en_curso') {
    const s = await uno<{ nombre: string }>('SELECT nombre FROM solicitudes WHERE id = ?1', id);
    if (!s) return { ok: false, errores: ['Esa petición ya no existe.'] };
    await cambiarEstadoSolicitud(id, 'en_curso', 'nueva');
    return { ok: true, hecho: 'curso', de: primerNombre(s.nombre) };
  }
  if (accion === 'en_revision') {
    const t = await uno<{ nombre: string }>('SELECT nombre FROM talleristas WHERE id = ?1', id);
    if (!t) return { ok: false, errores: ['Esa tallerista ya no existe.'] };
    await cambiarEstadoTallerista(id, 'revision', 'nueva');
    return { ok: true, hecho: 'revision', de: primerNombre(t.nombre) };
  }
  return { ok: false, errores: ['No conozco esa acción.'] };
}

// ---------- Agenda de la semana ----------

export type EventoAgenda = {
  tipo: 'taller' | 'clase'; hora: string; titulo: string; href: string;
  /** Plazas ocupadas y totales (talleres) o alumnas y plazas (clases). */
  ocupadas: number; plazas: number; sinPagar: number; sueltas: number;
};
export type DiaAgenda = { fecha: string; etiqueta: string; hoy: boolean; manana: boolean; eventos: EventoAgenda[] };

/** De hoy a hoy+6: talleres publicados y clases de los grupos activos. Los días sin nada no salen. */
export async function agendaSemana(hoy = hoyEspana()): Promise<DiaAgenda[]> {
  const fin = sumarDias(hoy, 6);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i));
  const mesesDeLaSemana = [...new Set(dias.map((d) => d.slice(0, 7)))];

  const talleres = await todos<{ id: number; titulo: string; fecha: string; hora_inicio: string | null; plazas: number; ocupadas: number; sin_pagar: number }>(`
    SELECT t.id, COALESCE(t.titulo, 'Taller') AS titulo, t.fecha, t.hora_inicio, t.plazas,
           (SELECT COALESCE(sum(r.plazas), 0) FROM reservas r WHERE r.taller_id = t.id AND r.estado IN ('pendiente', 'confirmada')) AS ocupadas,
           (SELECT COALESCE(sum(r.plazas), 0) FROM reservas r WHERE r.taller_id = t.id AND r.estado = 'pendiente') AS sin_pagar
    FROM talleres t WHERE t.estado = 'publicado' AND t.fecha BETWEEN ?1 AND ?2 ORDER BY t.fecha, t.hora_inicio`, hoy, fin);

  const grupos = await gruposActivos();
  const mensuales = await todos<{ grupo_id: number; mes: string; estado: string; n: number }>(
    `SELECT grupo_id, mes, estado, count(*) AS n FROM reservas
     WHERE tipo = 'clase_mensual' AND mes IN (${mesesDeLaSemana.map((_, i) => `?${i + 1}`).join(',')}) AND estado IN ('pendiente', 'confirmada')
     GROUP BY grupo_id, mes, estado`, ...mesesDeLaSemana);
  const sueltas = await todos<{ grupo_id: number; fecha_sesion: string; estado: string; n: number }>(
    `SELECT grupo_id, fecha_sesion, estado, count(*) AS n FROM reservas
     WHERE tipo = 'clase_suelta' AND fecha_sesion BETWEEN ?1 AND ?2 AND estado IN ('pendiente', 'confirmada')
     GROUP BY grupo_id, fecha_sesion, estado`, hoy, fin);

  return dias.flatMap((fecha, i): DiaAgenda[] => {
    const eventos: EventoAgenda[] = talleres.filter((t) => t.fecha === fecha).map((t) => ({
      tipo: 'taller', hora: t.hora_inicio ?? '', titulo: t.titulo, href: `/panel/talleres/${t.id}`,
      ocupadas: t.ocupadas, plazas: t.plazas, sinPagar: t.sin_pagar, sueltas: 0,
    }));
    for (const g of grupos.filter((x) => x.dia_semana === diaSemana(fecha))) {
      const delMes = mensuales.filter((m) => m.grupo_id === g.id && m.mes === fecha.slice(0, 7));
      const delDia = sueltas.filter((s) => s.grupo_id === g.id && s.fecha_sesion === fecha);
      const suma = (l: { n: number; estado: string }[], solo?: string) => l.filter((x) => !solo || x.estado === solo).reduce((s, x) => s + x.n, 0);
      eventos.push({
        tipo: 'clase', hora: g.hora_inicio, titulo: g.nombre, href: `/panel/clases#g${g.id}`,
        ocupadas: suma(delMes), plazas: g.plazas, sinPagar: suma(delMes, 'pendiente') + suma(delDia, 'pendiente'), sueltas: suma(delDia),
      });
    }
    if (eventos.length === 0) return [];
    eventos.sort((a, b) => a.hora.localeCompare(b.hora));
    const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : diaCorto(fecha).replace(/^./, (x) => x.toUpperCase());
    return [{ fecha, etiqueta, hoy: i === 0, manana: i === 1, eventos }];
  });
}
