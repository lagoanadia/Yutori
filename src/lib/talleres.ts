// Reglas de los talleres compartidas por el panel y el asistente: crear huecos y publicar.
import { db, uno, FRANJAS } from './db';
import { codigoAleatorio, esFecha, esHora, fechaLimite, franjasDeFecha, slugify } from './util';
import { borrarFoto, errorDeFoto, guardarFoto } from './fotos';
import { hoyEspana } from './reservas';
import { avisoHuecoCreado } from './avisos';
import { actualizarCalendario } from './calendario';

type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: string[] };

/** Crea un hueco de taller (viernes tarde o fin de semana, franja libre). Devuelve su id. */
export async function crearHueco(d: {
  talleristaId: number | null; fecha: string; momento: 'manana' | 'tarde'; plazas: number; limite?: string | null;
}): Promise<Resultado<number>> {
  const errores: string[] = [];
  let franja = '';
  if (!esFecha(d.fecha)) {
    errores.push('La fecha no es válida.');
  } else {
    const posibles = franjasDeFecha(d.fecha);
    franja = posibles.find((f) => f.endsWith(d.momento)) ?? '';
    if (posibles.length === 0) errores.push('Los talleres son los viernes por la tarde, sábados y domingos.');
    else if (!franja) errores.push('Los viernes solo hay talleres por la tarde.');
    if (d.fecha < hoyEspana()) errores.push('La fecha ya ha pasado.');
  }
  if (!Number.isInteger(d.plazas) || d.plazas < 1 || d.plazas > 30) errores.push('Las plazas tienen que ser un número entre 1 y 30.');
  if (d.limite && !esFecha(d.limite)) errores.push('La fecha límite no es válida.');
  if (d.talleristaId !== null) {
    const ok = await uno(`SELECT id FROM talleristas WHERE id = ?1 AND estado = 'aceptada'`, d.talleristaId);
    if (!ok) errores.push('Esa tallerista no está aceptada.');
  }
  if (errores.length === 0) {
    const ocupada = await uno(`SELECT id FROM talleres WHERE fecha = ?1 AND franja = ?2 AND estado <> 'desactivado'`, d.fecha, franja);
    if (ocupada) errores.push(`Esa franja (${FRANJAS[franja]}) ya tiene un taller.`);
  }
  if (errores.length > 0) return { ok: false, errores };

  const nuevo = await db()
    .prepare(`INSERT INTO talleres (tallerista_id, fecha, franja, plazas, estado, codigo_enlace, fecha_limite)
              VALUES (?1, ?2, ?3, ?4, 'hueco', ?5, ?6) RETURNING id`)
    .bind(d.talleristaId, d.fecha, franja, d.plazas, codigoAleatorio(), d.limite || fechaLimite(d.fecha))
    .first<{ id: number }>();
  await avisoHuecoCreado(nuevo!.id);
  return { ok: true, valor: nuevo!.id };
}

/** Publica un taller si tiene todos los datos y, si es de una tallerista, los 25 € cobrados. */
export async function publicarTaller(id: number): Promise<Resultado<string>> {
  const t = await uno<{
    titulo: string | null; slug: string | null; fecha: string; hora_inicio: string | null; hora_fin: string | null;
    precio_cent: number | null; foto: string | null; texto: string | null; datos_pago: string | null;
    tallerista_id: number | null; pago_reserva_recibido: number; estado: string;
  }>('SELECT * FROM talleres WHERE id = ?1', id);
  if (!t) return { ok: false, errores: ['Ese taller no existe.'] };
  const errores: string[] = [];
  if (t.estado === 'publicado') return { ok: true, valor: t.slug ?? '' };
  if (t.estado === 'desactivado') errores.push('El taller está desactivado: reactívalo primero.');
  if (!(t.titulo && t.hora_inicio && t.hora_fin && t.precio_cent != null && t.foto && t.texto && t.datos_pago)) {
    errores.push(`Faltan datos del taller${t.foto ? '' : ' (por ejemplo, la foto)'}: se completan desde su enlace privado.`);
  }
  if (t.tallerista_id && !t.pago_reserva_recibido) errores.push('Marca primero los 25 € de la reserva como recibidos.');
  if (errores.length > 0) return { ok: false, errores };

  let slug = t.slug;
  if (!slug) {
    const base = `${slugify(t.titulo!)}-${t.fecha.slice(5)}`;
    slug = base;
    for (let n = 2; await uno('SELECT id FROM talleres WHERE slug = ?1', slug); n++) slug = `${base}-${n}`;
  }
  await db().prepare(`UPDATE talleres SET estado = 'publicado', slug = ?1 WHERE id = ?2`).bind(slug, id).run();
  actualizarCalendario(id);
  return { ok: true, valor: slug };
}

export async function desactivarTaller(id: number) {
  await db().prepare(`UPDATE talleres SET estado = 'desactivado' WHERE id = ?1`).bind(id).run();
  actualizarCalendario(id);
}

export type CamposTaller = {
  titulo: string; hora_inicio: string; hora_fin: string; precio: string; plazas: string;
  texto: string; materiales: string; datos_pago: string; fecha: string; momento: string;
};

/**
 * Cambia los datos de un taller desde el panel. Un hueco puede ir a medias; uno publicado tiene que seguir completo.
 * La fecha solo se cambia si nadie ha reservado, y las plazas nunca bajan de las ya ocupadas.
 */
export async function editarTaller(id: number, v: CamposTaller, foto: File | null): Promise<Resultado<null>> {
  const t = await uno<{ fecha: string; franja: string; estado: string; foto: string | null; titulo: string | null }>(
    'SELECT fecha, franja, estado, foto, titulo FROM talleres WHERE id = ?1', id);
  if (!t) return { ok: false, errores: ['Ese taller no existe.'] };
  const ocupadas = (await uno<{ n: number }>(
    `SELECT COALESCE(sum(plazas), 0) AS n FROM reservas WHERE taller_id = ?1 AND estado IN ('pendiente', 'confirmada')`, id))?.n ?? 0;
  const conReservas = (await uno<{ n: number }>('SELECT count(*) AS n FROM reservas WHERE taller_id = ?1', id))?.n ?? 0;
  const errores: string[] = [];

  const precio = v.precio ? Number(v.precio.replace(',', '.')) : null;
  const plazas = Number(v.plazas);
  if ((v.hora_inicio && !esHora(v.hora_inicio)) || (v.hora_fin && !esHora(v.hora_fin))) errores.push('Las horas tienen que ser HH:MM.');
  else if (v.hora_inicio && v.hora_fin && v.hora_inicio >= v.hora_fin) errores.push('La hora de fin tiene que ser después de la de inicio.');
  if (precio !== null && !(precio >= 0 && precio <= 500)) errores.push('El precio tiene que estar entre 0 y 500 €.');
  if (!Number.isInteger(plazas) || plazas < 1 || plazas > 30) errores.push('Las plazas tienen que estar entre 1 y 30.');
  else if (plazas < ocupadas) errores.push(`Ya hay ${ocupadas} plazas reservadas: no puedes dejar menos.`);
  if (t.estado === 'publicado' && !(v.titulo && v.hora_inicio && v.hora_fin && precio !== null && v.texto && v.datos_pago)) {
    errores.push('El taller está publicado: no dejes vacío el título, el horario, el precio, el texto ni cómo se paga.');
  }
  if (foto) {
    const e = errorDeFoto(foto);
    if (e) errores.push(e);
  }

  // Cambio de fecha o franja: mismas reglas que al crear el hueco.
  let franja = t.franja;
  const momento = v.momento === 'manana' ? 'manana' : 'tarde';
  if (v.fecha !== t.fecha || !t.franja.endsWith(momento)) {
    if (conReservas > 0) errores.push('Ya tiene reservas: la fecha no se puede cambiar. Desactívalo y crea otro si hace falta.');
    else if (!esFecha(v.fecha)) errores.push('La fecha no es válida.');
    else {
      const posibles = franjasDeFecha(v.fecha);
      franja = posibles.find((f) => f.endsWith(momento)) ?? '';
      if (posibles.length === 0) errores.push('Los talleres son los viernes por la tarde, sábados y domingos.');
      else if (!franja) errores.push('Los viernes solo hay talleres por la tarde.');
      else if (v.fecha < hoyEspana()) errores.push('La fecha ya ha pasado.');
      else if (await uno(`SELECT id FROM talleres WHERE fecha = ?1 AND franja = ?2 AND estado <> 'desactivado' AND id <> ?3`, v.fecha, franja, id)) {
        errores.push(`Esa franja (${FRANJAS[franja]}) ya tiene un taller.`);
      }
    }
  }
  if (errores.length) return { ok: false, errores };

  const claveFoto = foto ? await guardarFoto(foto, 'talleres') : t.foto;
  const titulo = v.titulo.slice(0, 100) || null;
  await db().prepare(`UPDATE talleres SET titulo = ?1, hora_inicio = ?2, hora_fin = ?3, precio_cent = ?4, plazas = ?5, texto = ?6,
                      materiales = ?7, datos_pago = ?8, fecha = ?9, franja = ?10, foto = ?11,
                      estado = CASE WHEN estado = 'hueco' AND ?1 IS NOT NULL THEN 'enviado' ELSE estado END WHERE id = ?12`)
    .bind(titulo, v.hora_inicio || null, v.hora_fin || null, precio === null ? null : Math.round(precio * 100), plazas,
          v.texto.slice(0, 3000) || null, v.materiales.slice(0, 200) || null, v.datos_pago.slice(0, 300) || null,
          v.fecha, franja, claveFoto, id)
    .run();
  if (foto && t.foto) await borrarFoto(t.foto);
  actualizarCalendario(id);
  return { ok: true, valor: null };
}
