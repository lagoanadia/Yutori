// Mensajes: avisos predefinidos que Iris envía cuando quiere (recordatorios de pago, de baja, de clase…)
// a un grupo de personas, por email o con un toque en WhatsApp. Las plantillas usan la voz de Yutori.
import { env } from 'cloudflare:workers';
import { DIAS, fecha, todos } from './db';
import { gruposActivos, meses, mesInscripcion, nombreMes } from './clases';
import { hoyEspana } from './reservas';
import { enviar } from './email';

/** Huecos que se rellenan con los datos de cada persona. */
export const HUECOS = ['{nombre}', '{que}', '{cuando}', '{enlace}'] as const;

export const PLANTILLAS: Record<string, { titulo: string; asunto: string; texto: string }> = {
  pago: {
    titulo: 'Recordatorio de pago',
    asunto: 'Recordatorio de pago · Yutori',
    texto: '¡Hola, {nombre}! Te escribimos para recordarte que tienes pendiente el pago de {que}. Tienes todos los detalles aquí: {enlace}. ¡Gracias!',
  },
  baja: {
    titulo: 'Último día para avisar de la baja (25)',
    asunto: 'Tu plaza del mes que viene · Yutori',
    texto: '¡Hola, {nombre}! Te recordamos que el día 25 es el último día para avisarnos si no sigues el mes que viene en {que}. Si sigues, no tienes que hacer nada: tu plaza se renueva sola.',
  },
  recordatorio: {
    titulo: 'Recordatorio de clase o taller',
    asunto: 'Te esperamos · Yutori',
    texto: '¡Hola, {nombre}! Te recordamos que te esperamos en {que}, {cuando}. ¡Hasta pronto!',
  },
  cambio: {
    titulo: 'Cambio o cancelación',
    asunto: 'Cambio en tu clase · Yutori',
    texto: '¡Hola, {nombre}! Te escribimos porque hay un cambio en {que}: ',
  },
  libre: { titulo: 'Mensaje libre', asunto: 'Mensaje de Yutori', texto: '¡Hola, {nombre}! ' },
};

export type Destinatario = { nombre: string; email: string; telefono: string | null; que: string; cuando: string; enlace: string };
export type Grupo = { clave: string; titulo: string; seccion: string };

const url = (ruta: string) => new URL(ruta, env.SITIO_URL || 'http://localhost:4321').href;

/** Grupos a los que se puede escribir: cada horario del mes, cada taller próximo, pendientes de pago y talleristas. */
export async function gruposDisponibles(): Promise<Grupo[]> {
  const mes = mesInscripcion() ?? meses().actual;
  const [grupos, talleres] = await Promise.all([
    gruposActivos(),
    todos<{ id: number; titulo: string; fecha: string }>(
      `SELECT id, COALESCE(titulo, 'Taller') AS titulo, fecha FROM talleres WHERE estado = 'publicado' AND fecha >= ?1 ORDER BY fecha`, hoyEspana()),
  ]);
  return [
    { clave: 'mensuales', titulo: `Todas las alumnas mensuales de ${nombreMes(mes)}`, seccion: 'Clases' },
    ...grupos.map((g) => ({
      clave: `grupo:${g.id}`, seccion: 'Clases',
      titulo: `${g.nombre} · ${DIAS[g.dia_semana]} ${g.hora_inicio}${g.publico === 'ninos' ? ' (niños)' : ''} · ${nombreMes(mes)}`,
    })),
    ...talleres.map((t) => ({ clave: `taller:${t.id}`, titulo: `${t.titulo} · ${fecha(t.fecha)}`, seccion: 'Talleres' })),
    { clave: 'pendientes', titulo: 'Todas las reservas pendientes de pago', seccion: 'Pagos' },
    { clave: 'talleristas', titulo: 'Talleristas aceptadas', seccion: 'Talleristas' },
  ];
}

type FilaReserva = {
  nombre: string; nombre_menor: string | null; email: string; telefono: string; codigo: string | null; tipo: string;
  titulo: string; mes: string | null; fecha: string | null; dia_semana: number | null; hora: string | null;
};
const SELECT_RESERVA = `
  SELECT r.nombre, r.nombre_menor, r.email, r.telefono, r.codigo, r.tipo, COALESCE(t.titulo, c.nombre) AS titulo, r.mes,
         COALESCE(t.fecha, r.fecha_sesion) AS fecha, g.dia_semana, COALESCE(t.hora_inicio, g.hora_inicio) AS hora
  FROM reservas r LEFT JOIN talleres t ON t.id = r.taller_id
  LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id`;

const deReserva = (r: FilaReserva): Destinatario => ({
  // En las clases de niños se saluda a la madre, padre o tutor (quien reservó).
  nombre: r.nombre.split(' ')[0],
  email: r.email, telefono: r.telefono,
  que: r.tipo === 'taller' ? `el taller ${r.titulo}` : `la clase de ${r.titulo}${r.nombre_menor ? ` de ${r.nombre_menor}` : ''}`,
  cuando: r.tipo === 'clase_mensual'
    ? `los ${DIAS[r.dia_semana ?? 0].toLowerCase()} a las ${r.hora}`
    : `el ${fecha(r.fecha)}${r.hora ? ` a las ${r.hora}` : ''}`,
  enlace: r.codigo ? url(`/reserva/${r.codigo}`) : url('/'),
});

/** Las personas de un grupo, con los datos para rellenar la plantilla. Una sola vez cada email. */
export async function destinatarios(clave: string): Promise<Destinatario[]> {
  const mes = mesInscripcion() ?? meses().actual;
  const [tipo, id] = clave.split(':');
  let lista: Destinatario[] = [];
  if (tipo === 'mensuales' || tipo === 'grupo') {
    lista = (await todos<FilaReserva>(`${SELECT_RESERVA}
      WHERE r.tipo = 'clase_mensual' AND r.mes = ?1 AND r.estado IN ('pendiente', 'confirmada') ${tipo === 'grupo' ? 'AND r.grupo_id = ?2' : ''}
      ORDER BY r.nombre`, mes, ...(tipo === 'grupo' ? [Number(id)] : []))).map(deReserva);
  } else if (tipo === 'taller') {
    lista = (await todos<FilaReserva>(`${SELECT_RESERVA}
      WHERE r.taller_id = ?1 AND r.estado IN ('pendiente', 'confirmada') ORDER BY r.nombre`, Number(id))).map(deReserva);
  } else if (tipo === 'pendientes') {
    lista = (await todos<FilaReserva>(`${SELECT_RESERVA}
      WHERE r.estado = 'pendiente' AND (r.caduca_en IS NULL OR r.caduca_en >= strftime('%Y-%m-%dT%H:%M:%S', 'now'))
      ORDER BY r.creado_en`)).map(deReserva);
  } else if (tipo === 'talleristas') {
    lista = (await todos<{ nombre: string; email: string; telefono: string | null; codigo: string | null; fecha: string | null }>(`
      SELECT ta.nombre, ta.email, ta.telefono,
             (SELECT t.codigo_enlace FROM talleres t WHERE t.tallerista_id = ta.id AND t.fecha >= ?1 ORDER BY t.fecha LIMIT 1) AS codigo,
             (SELECT t.fecha FROM talleres t WHERE t.tallerista_id = ta.id AND t.fecha >= ?1 ORDER BY t.fecha LIMIT 1) AS fecha
      FROM talleristas ta WHERE ta.estado = 'aceptada' ORDER BY ta.nombre`, hoyEspana())).map((t) => ({
      nombre: t.nombre.split(' ')[0], email: t.email, telefono: t.telefono,
      que: 'tu taller', cuando: t.fecha ? `el ${fecha(t.fecha)}` : '', enlace: t.codigo ? url(`/t/${t.codigo}`) : url('/colabora'),
    }));
  }
  const vistos = new Set<string>();
  return lista.filter((d) => {
    const k = (d.email || d.telefono || d.nombre).toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Rellena los huecos de una plantilla con los datos de una persona. */
export const rellenar = (texto: string, d: Destinatario) =>
  texto.replaceAll('{nombre}', d.nombre).replaceAll('{que}', d.que).replaceAll('{cuando}', d.cuando).replaceAll('{enlace}', d.enlace);

/** Si los emails están configurados (Resend y remitente). */
export const emailsActivos = () => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

/** Envía el mensaje por email a cada persona del grupo que tenga email. Devuelve a cuántas. */
export function enviarPorEmail(lista: Destinatario[], asunto: string, texto: string) {
  const conEmail = lista.filter((d) => d.email);
  enviar(...conEmail.map((d) => ({
    para: d.email, asunto, titulo: `¡Hola, ${d.nombre}!`,
    // El saludo ya va en el título: se quita del cuerpo para no repetirlo.
    parrafos: rellenar(texto, d).replace(/^¡Hola, [^!]*! ?/, '').split(/\n+/).filter(Boolean),
  })));
  return conEmail.length;
}
