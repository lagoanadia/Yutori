// Google Calendar: los talleres publicados aparecen en el calendario de Yutori con sus apuntadas.
// Usa una "cuenta de servicio" de Google con la que se comparte el calendario (sin contraseñas de nadie).
// Sin GOOGLE_CALENDAR_ID / GOOGLE_SA_EMAIL / GOOGLE_SA_KEY no hace nada.
import { env, waitUntil } from 'cloudflare:workers';
import { importPKCS8, SignJWT } from 'jose';
import { negocio } from '../data/yutori';
import { db, todos, uno } from './db';

export const calendarioActivo = () => Boolean(env.GOOGLE_CALENDAR_ID && env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY);

let token: { valor: string; caduca: number } | undefined;

async function tokenGoogle() {
  if (token && token.caduca > Date.now() + 60_000) return token.valor;
  const clave = await importPKCS8(env.GOOGLE_SA_KEY.replace(/\\n/g, '\n'), 'RS256');
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/calendar.events' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(env.GOOGLE_SA_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(clave);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error(`Google token ${r.status}: ${await r.text()}`);
  const datos = (await r.json()) as { access_token: string; expires_in: number };
  token = { valor: datos.access_token, caduca: Date.now() + datos.expires_in * 1000 };
  return token.valor;
}

async function google(metodo: string, ruta: string, cuerpo?: unknown) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`;
  const r = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${await tokenGoogle()}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok && !(metodo === 'DELETE' && (r.status === 404 || r.status === 410))) {
    throw new Error(`Google Calendar ${metodo} ${r.status}: ${await r.text()}`);
  }
  return r.status === 204 ? null : (r.json() as Promise<{ id: string }>);
}

/** Contenido del evento: título, horario y la lista de apuntadas. */
async function evento(tallerId: number) {
  const t = await uno<{ titulo: string; fecha: string; hora_inicio: string; hora_fin: string; plazas: number; quien: string }>(`
    SELECT t.titulo, t.fecha, t.hora_inicio, t.hora_fin, t.plazas, COALESCE(ta.marca, ta.nombre, 'Yutori') AS quien
    FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id WHERE t.id = ?1`, tallerId);
  if (!t) return null;
  const apuntadas = await todos<{ nombre: string; telefono: string; plazas: number; estado: string }>(
    `SELECT nombre, telefono, plazas, estado FROM reservas WHERE taller_id = ?1 AND estado IN ('pendiente', 'confirmada') ORDER BY creado_en`, tallerId);
  const ocupadas = apuntadas.reduce((s, a) => s + a.plazas, 0);
  const lista = apuntadas.map((a) => `• ${a.nombre} (${a.plazas}) ${a.telefono}${a.estado === 'pendiente' ? ' · pendiente de pago' : ''}`);
  const panel = new URL(`/panel/talleres/${tallerId}`, env.SITIO_URL || 'http://localhost:4321').href;
  return {
    summary: `${t.titulo} · ${t.quien} (${ocupadas}/${t.plazas})`,
    location: `Yutori Espacio Creativo, ${negocio.direccion}, ${negocio.ciudad}`,
    description: [`Plazas: ${ocupadas} de ${t.plazas}`, '', ...(lista.length ? lista : ['Todavía no se ha apuntado nadie.']), '', `Panel: ${panel}`].join('\n'),
    start: { dateTime: `${t.fecha}T${t.hora_inicio}:00`, timeZone: 'Europe/Madrid' },
    end: { dateTime: `${t.fecha}T${t.hora_fin}:00`, timeZone: 'Europe/Madrid' },
  };
}

/** Crea o actualiza el evento de un taller publicado. */
async function sincronizar(tallerId: number) {
  const t = await uno<{ estado: string; google_evento: string | null }>('SELECT estado, google_evento FROM talleres WHERE id = ?1', tallerId);
  if (!t) return;
  if (t.estado !== 'publicado') {
    if (t.google_evento) {
      await google('DELETE', `/${encodeURIComponent(t.google_evento)}`);
      await db().prepare('UPDATE talleres SET google_evento = NULL WHERE id = ?1').bind(tallerId).run();
    }
    return;
  }
  const datos = await evento(tallerId);
  if (!datos) return;
  if (t.google_evento) {
    await google('PATCH', `/${encodeURIComponent(t.google_evento)}`, datos);
  } else {
    const creado = await google('POST', '', datos);
    if (creado) await db().prepare('UPDATE talleres SET google_evento = ?1 WHERE id = ?2').bind(creado.id, tallerId).run();
  }
}

/** Pone al día el calendario de uno o varios talleres, en segundo plano y sin romper nada si falla. */
export function actualizarCalendario(...talleres: (number | null | undefined)[]) {
  const ids = [...new Set(talleres.filter((id): id is number => typeof id === 'number'))];
  if (!calendarioActivo() || ids.length === 0) return;
  const tarea = Promise.all(ids.map((id) => sincronizar(id).catch((e) => console.error('[calendario]', e))));
  try {
    waitUntil(tarea);
  } catch {
    // Fuera de una petición: se deja correr.
  }
}
