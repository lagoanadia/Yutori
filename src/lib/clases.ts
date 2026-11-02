// Clases semanales: grupos, plazas por mes y por sesión, plazas mensuales y clases sueltas.
import { db, todos, uno } from './db';
import { MOSTRAR_NINOS } from '../data/yutori';
import { hoyEspana, liberarCaducadas, plazoPago } from './reservas';
import { stripeActivo } from './stripe';
import { diaSemana } from './util';
import { avisoRenovadas, avisoReservaHecha } from './avisos';

export type Grupo = {
  id: number; clase_id: number; slug: string; nombre: string; tipo: string; colabora: string | null; texto: string | null;
  temas: string; kit_incluido: number; modalidades: string; dia_semana: number; hora_inicio: string; hora_fin: string;
  plazas: number; publico: 'adultos' | 'ninos'; precio_mes_cent: number | null; precio_mes_max_cent: number | null;
  precio_suelta_cent: number | null; profe_nombre: string | null; profe_texto: string | null; profe_foto: string | null;
};

export async function gruposActivos() {
  return todos<Grupo>(`
    SELECT g.id, g.clase_id, c.slug, c.nombre, c.tipo, c.colabora, c.texto, c.temas, c.kit_incluido, c.modalidades,
           g.dia_semana, g.hora_inicio, g.hora_fin, g.plazas, g.publico, g.precio_mes_cent, g.precio_mes_max_cent,
           c.precio_suelta_cent, c.profe_nombre, c.profe_texto, c.profe_foto
    FROM grupos g JOIN clases c ON c.id = g.clase_id
    WHERE g.activo = 1 AND c.activa = 1 ${MOSTRAR_NINOS ? '' : "AND g.publico = 'adultos'"}
    ORDER BY c.id, g.publico, g.dia_semana, g.hora_inicio`);
}

export const grupoPorId = (id: number) =>
  uno<Grupo>(`
    SELECT g.id, g.clase_id, c.slug, c.nombre, c.tipo, c.colabora, c.texto, c.temas, c.kit_incluido, c.modalidades,
           g.dia_semana, g.hora_inicio, g.hora_fin, g.plazas, g.publico, g.precio_mes_cent, g.precio_mes_max_cent,
           c.precio_suelta_cent, c.profe_nombre, c.profe_texto, c.profe_foto
    FROM grupos g JOIN clases c ON c.id = g.clase_id WHERE g.id = ?1 AND g.activo = 1 AND c.activa = 1`, id);

/** Mes en formato AAAA-MM: el actual y el siguiente (hora de España). */
export function meses() {
  const hoy = hoyEspana();
  const [a, m] = hoy.split('-').map(Number);
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return { actual: hoy.slice(0, 7), siguiente: sig };
}

/** Último día del mes en que una alumna mensual puede avisar de que no sigue el mes siguiente. */
export const DIA_LIMITE_BAJA = 25;
/** Día en que se renuevan las mensuales y se abren las plazas libres del mes siguiente. */
export const DIA_RENOVACION = 26;
/** Día en que se cobran con tarjeta las plazas renovadas (deja margen a quien cobra el 30 o el 31). */
export const DIA_COBRO = 1;

/**
 * El mes al que se puede apuntar una alumna mensual nueva: el siguiente, desde el día 26 (cuando ya están renovadas
 * las de este mes). Del 1 al 25 no hay plaza mensual nueva: no se entra a mitad de mes, solo a clases sueltas.
 */
export function mesInscripcion(): string | null {
  return Number(hoyEspana().slice(8, 10)) >= DIA_RENOVACION ? meses().siguiente : null;
}

/** Si hoy todavía se puede avisar de la baja del mes siguiente. */
export const bajaAbierta = () => Number(hoyEspana().slice(8, 10)) <= DIA_LIMITE_BAJA;

// Precio de una plaza mensual: los horarios con dos precios (costura) cobran el alto en la modalidad «Con máquina».
// TODO: confirmar con Iris qué precio corresponde a cada modalidad.
export const MODALIDAD_PRECIO_ALTO = 'Con máquina';
const IMPORTE_MENSUAL = (grupo: string, modalidad: string) =>
  `CASE WHEN ${grupo}.precio_mes_max_cent IS NOT NULL AND ${modalidad} = '${MODALIDAD_PRECIO_ALTO}' THEN ${grupo}.precio_mes_max_cent ELSE ${grupo}.precio_mes_cent END`;

/** Importe de una plaza mensual de un horario con una modalidad. */
export const importeMensual = (g: Pick<Grupo, 'precio_mes_cent' | 'precio_mes_max_cent'>, modalidad: string | null) =>
  g.precio_mes_max_cent != null && modalidad === MODALIDAD_PRECIO_ALTO ? g.precio_mes_max_cent : g.precio_mes_cent;

// Primera vez en una clase (para preparar el kit de iniciación): nadie con ese email ha pagado antes esa clase.
const PRIMERA_VEZ = (grupo: string, email: string) =>
  `CASE WHEN EXISTS (SELECT 1 FROM reservas p JOIN grupos pg ON pg.id = p.grupo_id
                     WHERE pg.clase_id = ${grupo}.clase_id AND lower(p.email) = lower(${email}) AND p.estado = 'confirmada')
        THEN 0 ELSE 1 END`;

export const nombreMes = (mes: string) =>
  new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const MENSUALES = (grupo: string, mes: string) =>
  `(SELECT count(*) FROM reservas r WHERE r.grupo_id = ${grupo} AND r.tipo = 'clase_mensual' AND r.mes = ${mes} AND r.estado IN ('pendiente', 'confirmada'))`;
const SUELTAS = (grupo: string, fecha: string) =>
  `(SELECT count(*) FROM reservas r WHERE r.grupo_id = ${grupo} AND r.tipo = 'clase_suelta' AND r.fecha_sesion = ${fecha} AND r.estado IN ('pendiente', 'confirmada'))`;

// Una alumna mensual ocupa sitio en todas las sesiones del mes, así que hay que contar también el día
// con más clases sueltas (el pico): si no, la mensual podría dejar una sesión con más gente que plazas.
// Las sueltas de días ya pasados no cuentan (`hoy` es un parámetro SQL): ya no ocupan sitio.
const PICO_SUELTAS = (grupo: string, mes: string, hoy: string) =>
  `COALESCE((SELECT count(*) FROM reservas s WHERE s.grupo_id = ${grupo} AND s.tipo = 'clase_suelta' AND substr(s.fecha_sesion, 1, 7) = ${mes} AND s.fecha_sesion >= ${hoy} AND s.estado IN ('pendiente', 'confirmada') GROUP BY s.fecha_sesion ORDER BY count(*) DESC LIMIT 1), 0)`;

/** Plazas ocupadas de cada grupo en un mes (mensuales + pico de sueltas): { grupoId: número }. */
export async function ocupacionMes(mes: string) {
  await asegurarRenovacion();
  await liberarCaducadas();
  const filas = await todos<{ grupo_id: number; n: number }>(
    `SELECT g.id AS grupo_id, ${MENSUALES('g.id', '?1')} + ${PICO_SUELTAS('g.id', '?1', '?2')} AS n FROM grupos g`, mes, hoyEspana());
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
  await asegurarRenovacion();
  await liberarCaducadas();
  const r = await uno<{ libres: number }>(
    `SELECT g.plazas - ${MENSUALES('g.id', '?2')} - ${SUELTAS('g.id', '?3')} AS libres FROM grupos g WHERE g.id = ?1`,
    grupoId, fecha.slice(0, 7), fecha);
  return Math.max(0, r?.libres ?? 0);
}

/** Para cada grupo de adultos: próximas sesiones y plazas libres en cada una (2 consultas para todo). */
export async function disponibilidadSueltas(grupos: Grupo[]) {
  await asegurarRenovacion();
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
                acepta_condiciones_en, acepta_privacidad_en, importe_cent, primera_vez`;
const AHORA = `strftime('%Y-%m-%dT%H:%M:%S', 'now')`;

/** Plaza mensual: se paga al reservar (con tarjeta, si Stripe está activo). Solo si queda plaza ese mes. */
export async function reservarMensual(grupoId: number, mes: string, d: DatosAlumna) {
  await asegurarRenovacion();
  await liberarCaducadas();
  const r = await db()
    .prepare(`
      INSERT INTO reservas (${CAMPOS})
      SELECT 'clase_mensual', g.id, ?2, NULL, ?3, ?4, ?5, ?6, ?7, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', ?8),
             lower(hex(randomblob(12))), ${AHORA}, ${AHORA}, ${IMPORTE_MENSUAL('g', '?6')}, ${PRIMERA_VEZ('g', '?5')}
      FROM grupos g WHERE g.id = ?1 AND g.activo = 1 AND g.plazas - ${MENSUALES('g.id', '?2')} - ${PICO_SUELTAS('g.id', '?2', '?9')} >= 1
      RETURNING codigo`)
    .bind(grupoId, mes, d.nombre, d.telefono, d.email, d.modalidad, d.menor, plazoPago(), hoyEspana())
    .first<{ codigo: string }>();
  if (r?.codigo && !stripeActivo()) await avisoReservaHecha(r.codigo);
  return r?.codigo ?? null;
}

/** Clase suelta en una fecha: se paga al reservar (con tarjeta, si Stripe está activo). */
export async function reservarSuelta(grupoId: number, fecha: string, d: DatosAlumna) {
  await asegurarRenovacion();
  await liberarCaducadas();
  const r = await db()
    .prepare(`
      INSERT INTO reservas (${CAMPOS})
      SELECT 'clase_suelta', g.id, NULL, ?2, ?3, ?4, ?5, ?6, NULL, 'pendiente',
             strftime('%Y-%m-%dT%H:%M:%S', 'now', ?7), lower(hex(randomblob(12))), ${AHORA}, ${AHORA},
             c.precio_suelta_cent, ${PRIMERA_VEZ('g', '?5')}
      FROM grupos g JOIN clases c ON c.id = g.clase_id
      WHERE g.id = ?1 AND g.activo = 1 AND g.publico = 'adultos'
        AND g.plazas - ${MENSUALES('g.id', '?8')} - ${SUELTAS('g.id', '?2')} >= 1
      RETURNING codigo`)
    .bind(grupoId, fecha, d.nombre, d.telefono, d.email, d.modalidad, plazoPago(), fecha.slice(0, 7))
    .first<{ codigo: string }>();
  if (r?.codigo && !stripeActivo()) await avisoReservaHecha(r.codigo);
  return r?.codigo ?? null;
}

/**
 * Renovación automática: desde el día 26 (la primera vez que se usa la web o salta la tarea diaria) las mensuales confirmadas
 * del mes actual que no han avisado de baja pasan al siguiente, antes de que se muestren o vendan sus plazas.
 * La fila de `renovaciones` hace que ocurra una sola vez.
 */
export async function asegurarRenovacion() {
  if (Number(hoyEspana().slice(8, 10)) < DIA_RENOVACION) return;
  const { actual, siguiente } = meses();
  const r = await db()
    .prepare(`INSERT OR IGNORE INTO renovaciones (mes, hecha_en) VALUES (?1, ${AHORA})`)
    .bind(siguiente)
    .run();
  if (r.meta.changes !== 1) return;
  try {
    const { codigos } = await renovarMes(actual, siguiente);
    avisoRenovadas(codigos);
  } catch (e) {
    // Si falla, se deshace la marca para que la próxima visita lo reintente.
    await db().prepare(`DELETE FROM renovaciones WHERE mes = ?1`).bind(siguiente).run();
    throw e;
  }
}

/**
 * Prioridad de las alumnas: copia las mensuales CONFIRMADAS de un mes que no han avisado de baja al siguiente, pendientes de
 * cobro el día 1. Su plaza no caduca: si el cobro falla se gestiona a mano. Conservan la tarjeta guardada y su forma de pago
 * (sin tarjeta guardada, efectivo). No se copian si ya tienen en ese grupo y mes cualquier reserva (también cancelada o
 * liberada: así una cancelación de Iris no se deshace). Solo en horarios activos y mientras quepan en el cupo
 * (plazas - mensuales - pico de sueltas del destino). Devuelve cuántas se han renovado, cuántas no caben y sus códigos.
 */
export async function renovarMes(origen: string, destino: string) {
  await liberarCaducadas();
  // Las candidatas son las que aún no están apuntadas en el destino, en horarios y clases activos.
  const candidatas = `
    SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.grupo_id ORDER BY r.creado_en, r.id) AS fila
    FROM reservas r JOIN grupos g ON g.id = r.grupo_id AND g.activo = 1
    JOIN clases cl ON cl.id = g.clase_id AND cl.activa = 1
    WHERE r.tipo = 'clase_mensual' AND r.mes = ?1 AND r.estado = 'confirmada' AND r.no_renueva = 0
      AND NOT EXISTS (SELECT 1 FROM reservas x WHERE x.tipo = 'clase_mensual' AND x.mes = ?2 AND x.grupo_id = r.grupo_id
                      AND lower(x.email) = lower(r.email) AND lower(x.nombre) = lower(r.nombre) AND COALESCE(x.nombre_menor, '') = COALESCE(r.nombre_menor, ''))`;
  // Solo para informar: el INSERT de abajo es el que comprueba las plazas de verdad.
  const previstas = (await uno<{ n: number }>(`WITH candidatas AS (${candidatas}) SELECT count(*) AS n FROM candidatas`, origen, destino))?.n ?? 0;
  const { results } = await db()
    .prepare(`
      WITH candidatas AS (${candidatas})
      INSERT INTO reservas (${CAMPOS}, metodo_pago, stripe_cliente, stripe_metodo, tarjeta, renovada_de)
      SELECT 'clase_mensual', c.grupo_id, ?2, NULL, c.nombre, c.telefono, c.email, c.modalidad, c.nombre_menor, 'pendiente', NULL,
             lower(hex(randomblob(12))), c.acepta_condiciones_en, c.acepta_privacidad_en, ${IMPORTE_MENSUAL('g', 'c.modalidad')}, 0,
             CASE WHEN c.stripe_metodo IS NOT NULL THEN COALESCE(c.metodo_pago, 'tarjeta') ELSE 'efectivo' END,
             c.stripe_cliente, c.stripe_metodo, c.tarjeta, c.id
      FROM candidatas c JOIN grupos g ON g.id = c.grupo_id
      WHERE c.fila <= g.plazas - ${MENSUALES('g.id', '?2')} - ${PICO_SUELTAS('g.id', '?2', '?3')}
      ORDER BY c.grupo_id, c.fila
      RETURNING codigo`)
    .bind(origen, destino, hoyEspana())
    .all<{ codigo: string }>();
  const codigos = results.map((x) => x.codigo);
  return { renovadas: codigos.length, sinPlaza: Math.max(0, previstas - codigos.length), codigos };
}

/** Marca (o desmarca) que una alumna mensual no sigue el mes siguiente. Desde la web solo hasta el día 25; Iris, siempre. */
export async function marcarNoRenueva(id: number, valor: boolean) {
  const r = await db()
    .prepare(`UPDATE reservas SET no_renueva = ?2 WHERE id = ?1 AND tipo = 'clase_mensual' AND estado IN ('pendiente', 'confirmada')`)
    .bind(id, valor ? 1 : 0)
    .run();
  return r.meta.changes === 1;
}

/** Cambia la forma de pago de una plaza renovada aún sin cobrar. Con tarjeta solo si hay una guardada. */
export async function cambiarMetodoPago(id: number, metodo: 'tarjeta' | 'efectivo') {
  const r = await db()
    .prepare(`UPDATE reservas SET metodo_pago = ?2, cobro_error = NULL
              WHERE id = ?1 AND renovada_de IS NOT NULL AND estado = 'pendiente' AND cobro_intentado_en IS NULL
                AND (?2 = 'efectivo' OR stripe_metodo IS NOT NULL)`)
    .bind(id, metodo)
    .run();
  return r.meta.changes === 1;
}

/**
 * Apunta a mano (desde el panel) a una alumna mensual: sin emails ni plazo de pago, como las importadas. Paga en efectivo
 * hasta que deje una tarjeta.
 * La plaza se comprueba en la misma sentencia que inserta, y no se apunta dos veces a la misma persona en el mismo grupo y mes.
 */
export async function apuntarAlumnaMes(grupoId: number, mes: string, d: DatosAlumna, estado: 'confirmada' | 'pendiente') {
  await liberarCaducadas();
  const r = await db()
    .prepare(`
      INSERT INTO reservas (tipo, grupo_id, mes, nombre, telefono, email, modalidad, nombre_menor, estado, codigo, importe_cent, metodo_pago, primera_vez)
      SELECT 'clase_mensual', g.id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, lower(hex(randomblob(12))), ${IMPORTE_MENSUAL('g', '?6')}, 'efectivo',
             ${PRIMERA_VEZ('g', '?5')}
      FROM grupos g
      WHERE g.id = ?1 AND g.activo = 1 AND g.plazas - ${MENSUALES('g.id', '?2')} >= 1
        AND NOT EXISTS (SELECT 1 FROM reservas x WHERE x.tipo = 'clase_mensual' AND x.grupo_id = g.id AND x.mes = ?2
                        AND lower(x.nombre) = lower(?3) AND COALESCE(lower(x.nombre_menor), '') = COALESCE(lower(?7), '')
                        AND x.estado IN ('pendiente', 'confirmada'))
      RETURNING id`)
    .bind(grupoId, mes, d.nombre, d.telefono, d.email, d.modalidad, d.menor, estado)
    .first<{ id: number }>();
  return r?.id ?? null;
}
