// Clases semanales: grupos, plazas por mes y por sesión, plazas mensuales y clases sueltas.
import { db, todos, uno } from './db';
import { MOSTRAR_NINOS } from '../data/yutori';
import { hoyEspana, liberarCaducadas, PLAZO_PAGO_HORAS } from './reservas';
import { diaSemana } from './util';

export type Grupo = {
  id: number; clase_id: number; slug: string; nombre: string; tipo: string; colabora: string | null; texto: string | null;
  temas: string; kit_incluido: number; modalidades: string; dia_semana: number; hora_inicio: string; hora_fin: string;
  plazas: number; publico: 'adultos' | 'ninos'; precio_mes_cent: number | null; precio_mes_max_cent: number | null;
  precio_suelta_cent: number | null;
};

export async function gruposActivos() {
  return todos<Grupo>(`
    SELECT g.id, g.clase_id, c.slug, c.nombre, c.tipo, c.colabora, c.texto, c.temas, c.kit_incluido, c.modalidades,
           g.dia_semana, g.hora_inicio, g.hora_fin, g.plazas, g.publico, g.precio_mes_cent, g.precio_mes_max_cent,
           c.precio_suelta_cent
    FROM grupos g JOIN clases c ON c.id = g.clase_id
    WHERE g.activo = 1 AND c.activa = 1 ${MOSTRAR_NINOS ? '' : "AND g.publico = 'adultos'"}
    ORDER BY c.id, g.publico, g.dia_semana, g.hora_inicio`);
}

export const grupoPorId = (id: number) =>
  uno<Grupo>(`
    SELECT g.id, g.clase_id, c.slug, c.nombre, c.tipo, c.colabora, c.texto, c.temas, c.kit_incluido, c.modalidades,
           g.dia_semana, g.hora_inicio, g.hora_fin, g.plazas, g.publico, g.precio_mes_cent, g.precio_mes_max_cent,
           c.precio_suelta_cent
    FROM grupos g JOIN clases c ON c.id = g.clase_id WHERE g.id = ?1 AND g.activo = 1 AND c.activa = 1`, id);

/** Mes en formato AAAA-MM: el actual y el siguiente (hora de España). */
export function meses() {
  const hoy = hoyEspana();
  const [a, m] = hoy.split('-').map(Number);
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return { actual: hoy.slice(0, 7), siguiente: sig };
}

export const nombreMes = (mes: string) =>
  new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const MENSUALES = (grupo: string, mes: string) =>
  `(SELECT count(*) FROM reservas r WHERE r.grupo_id = ${grupo} AND r.tipo = 'clase_mensual' AND r.mes = ${mes} AND r.estado IN ('pendiente', 'confirmada'))`;
const SUELTAS = (grupo: string, fecha: string) =>
  `(SELECT count(*) FROM reservas r WHERE r.grupo_id = ${grupo} AND r.tipo = 'clase_suelta' AND r.fecha_sesion = ${fecha} AND r.estado IN ('pendiente', 'confirmada'))`;

/** Alumnas mensuales de cada grupo en un mes: { grupoId: número }. */
export async function ocupacionMes(mes: string) {
  const filas = await todos<{ grupo_id: number; n: number }>(
    `SELECT grupo_id, count(*) AS n FROM reservas WHERE tipo = 'clase_mensual' AND mes = ?1
     AND estado IN ('pendiente', 'confirmada') GROUP BY grupo_id`, mes);
  return new Map(filas.map((f) => [f.grupo_id, f.n]));
}

/** Próximas sesiones de un grupo en las siguientes semanas (sin las que ya han empezado hoy). */
export function proximasSesiones(g: Pick<Grupo, 'dia_semana' | 'hora_inicio'>, semanas = 4) {
  const hoy = hoyEspana();
  const ahora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const [a, m, d] = hoy.split('-').map(Number);
  const fechas: string[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const f = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10);
    if (diaSemana(f) !== g.dia_semana) continue;
    if (i === 0 && ahora >= g.hora_inicio) continue;
    fechas.push(f);
  }
  return fechas;
}

/** Plazas libres de un grupo en una fecha concreta (para clases sueltas). */
export async function libresSesion(grupoId: number, fecha: string) {
  await liberarCaducadas();
  const r = await uno<{ libres: number }>(
    `SELECT g.plazas - ${MENSUALES('g.id', '?2')} - ${SUELTAS('g.id', '?3')} AS libres FROM grupos g WHERE g.id = ?1`,
    grupoId, fecha.slice(0, 7), fecha);
  return Math.max(0, r?.libres ?? 0);
}

/** Para cada grupo de adultos: próximas sesiones y plazas libres en cada una (2 consultas para todo). */
export async function disponibilidadSueltas(grupos: Grupo[]) {
  await liberarCaducadas();
  const adultos = grupos.filter((g) => g.publico === 'adultos');
  const sesiones = new Map(adultos.map((g) => [g.id, proximasSesiones(g)]));
  const todas = [...sesiones.values()].flat();
  const resultado = new Map<number, { fecha: string; libres: number }[]>();
  if (todas.length === 0) return resultado;

  const desde = todas.reduce((a, b) => (a < b ? a : b));
  const hasta = todas.reduce((a, b) => (a > b ? a : b));
  const mensuales = await todos<{ grupo_id: number; mes: string; n: number }>(
    `SELECT grupo_id, mes, count(*) AS n FROM reservas WHERE tipo = 'clase_mensual' AND mes BETWEEN ?1 AND ?2
     AND estado IN ('pendiente', 'confirmada') GROUP BY grupo_id, mes`, desde.slice(0, 7), hasta.slice(0, 7));
  const sueltas = await todos<{ grupo_id: number; fecha_sesion: string; n: number }>(
    `SELECT grupo_id, fecha_sesion, count(*) AS n FROM reservas WHERE tipo = 'clase_suelta' AND fecha_sesion BETWEEN ?1 AND ?2
     AND estado IN ('pendiente', 'confirmada') GROUP BY grupo_id, fecha_sesion`, desde, hasta);
  const nMes = new Map(mensuales.map((m) => [`${m.grupo_id}|${m.mes}`, m.n]));
  const nDia = new Map(sueltas.map((s) => [`${s.grupo_id}|${s.fecha_sesion}`, s.n]));

  for (const g of adultos) {
    resultado.set(g.id, (sesiones.get(g.id) ?? []).map((fecha) => ({
      fecha,
      libres: Math.max(0, g.plazas - (nMes.get(`${g.id}|${fecha.slice(0, 7)}`) ?? 0) - (nDia.get(`${g.id}|${fecha}`) ?? 0)),
    })));
  }
  return resultado;
}

type DatosAlumna ={ nombre: string; telefono: string; email: string; modalidad: string | null; menor: string | null };

const CAMPOS = `tipo, grupo_id, mes, fecha_sesion, nombre, telefono, email, modalidad, nombre_menor, estado, caduca_en, codigo,
                acepta_condiciones_en, acepta_privacidad_en`;
const AHORA = `strftime('%Y-%m-%dT%H:%M:%S', 'now')`;

/** Plaza mensual (sin caducidad: se paga del 1 al 5). Solo si queda plaza ese mes. */
export async function reservarMensual(grupoId: number, mes: string, d: DatosAlumna) {
  const r = await db()
    .prepare(`
      INSERT INTO reservas (${CAMPOS})
      SELECT 'clase_mensual', g.id, ?2, NULL, ?3, ?4, ?5, ?6, ?7, 'pendiente', NULL, lower(hex(randomblob(12))), ${AHORA}, ${AHORA}
      FROM grupos g WHERE g.id = ?1 AND g.activo = 1 AND g.plazas - ${MENSUALES('g.id', '?2')} >= 1
      RETURNING codigo`)
    .bind(grupoId, mes, d.nombre, d.telefono, d.email, d.modalidad, d.menor)
    .first<{ codigo: string }>();
  return r?.codigo ?? null;
}

/** Clase suelta en una fecha: se paga al reservar (mismo plazo que los talleres). */
export async function reservarSuelta(grupoId: number, fecha: string, d: DatosAlumna) {
  await liberarCaducadas();
  const r = await db()
    .prepare(`
      INSERT INTO reservas (${CAMPOS})
      SELECT 'clase_suelta', g.id, NULL, ?2, ?3, ?4, ?5, ?6, NULL, 'pendiente',
             strftime('%Y-%m-%dT%H:%M:%S', 'now', ?7), lower(hex(randomblob(12))), ${AHORA}, ${AHORA}
      FROM grupos g
      WHERE g.id = ?1 AND g.activo = 1 AND g.publico = 'adultos'
        AND g.plazas - ${MENSUALES('g.id', '?8')} - ${SUELTAS('g.id', '?2')} >= 1
      RETURNING codigo`)
    .bind(grupoId, fecha, d.nombre, d.telefono, d.email, d.modalidad, `+${PLAZO_PAGO_HORAS} hours`, fecha.slice(0, 7))
    .first<{ codigo: string }>();
  return r?.codigo ?? null;
}

/**
 * Prioridad de las alumnas: copia las mensuales CONFIRMADAS de un mes al siguiente como pendientes de pago,
 * salvo que ya estén apuntadas en ese grupo y mes. Devuelve cuántas se han renovado.
 */
export async function renovarMes(origen: string, destino: string) {
  const r = await db()
    .prepare(`
      INSERT INTO reservas (${CAMPOS})
      SELECT 'clase_mensual', r.grupo_id, ?2, NULL, r.nombre, r.telefono, r.email, r.modalidad, r.nombre_menor, 'pendiente', NULL,
             lower(hex(randomblob(12))), r.acepta_condiciones_en, r.acepta_privacidad_en
      FROM reservas r
      WHERE r.tipo = 'clase_mensual' AND r.mes = ?1 AND r.estado = 'confirmada'
        AND NOT EXISTS (SELECT 1 FROM reservas x WHERE x.tipo = 'clase_mensual' AND x.mes = ?2 AND x.grupo_id = r.grupo_id
                        AND lower(x.email) = lower(r.email) AND COALESCE(x.nombre_menor, '') = COALESCE(r.nombre_menor, '')
                        AND x.estado IN ('pendiente', 'confirmada'))`)
    .bind(origen, destino)
    .run();
  return r.meta.changes;
}
