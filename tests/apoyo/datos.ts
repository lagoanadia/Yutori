// Datos de preparación para los tests de clases: se vacía lo que traen las migraciones y se crea lo justo.
import { env } from './cloudflare-workers';

export const alumna = (n: number) => ({
  nombre: `Alumna ${n}`, telefono: '600000000', email: `alumna${n}@ejemplo.es`, modalidad: null, menor: null,
});

/** Un grupo de adultos activo con las plazas indicadas (sin los grupos de las migraciones). */
export function crearGrupo(plazas = 8, activo = 1) {
  const db = env.DB;
  db.exec('DELETE FROM reservas; DELETE FROM grupos; DELETE FROM clases;');
  return crearGrupoExtra(plazas, activo, 'prueba');
}

/** Otro grupo (sin vaciar nada) en una clase nueva. */
export function crearGrupoExtra(plazas: number, activo: number, slug: string) {
  const db = env.DB;
  db.exec(`INSERT INTO clases (slug, nombre, tipo) VALUES ('${slug}', 'Clase ${slug}', 'prueba')`);
  const clase = (db.base.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
  db.exec(`INSERT INTO grupos (clase_id, dia_semana, hora_inicio, hora_fin, plazas, publico, activo)
           VALUES (${clase}, 6, '10:00', '11:00', ${plazas}, 'adultos', ${activo})`);
  return (db.base.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
}

type Reserva = { grupo: number; tipo: 'clase_mensual' | 'clase_suelta'; mes?: string; fecha?: string; estado?: string; n: number; creado?: string; caduca?: string };

/** Inserta una reserva directamente (sin pasar por la lógica que se prueba). */
export function insertarReserva(r: Reserva) {
  env.DB.prepare(`INSERT INTO reservas (tipo, grupo_id, mes, fecha_sesion, nombre, telefono, email, estado, codigo, creado_en, caduca_en)
                  VALUES (?1, ?2, ?3, ?4, ?5, '600000000', ?6, ?7, ?8, ?9, ?10)`)
    .bind(r.tipo, r.grupo, r.mes ?? null, r.fecha ?? null, `Alumna ${r.n}`, `alumna${r.n}@ejemplo.es`, r.estado ?? 'confirmada',
      `cod${Math.random().toString(36).slice(2)}`, r.creado ?? `2027-01-01T10:00:${String(r.n).padStart(2, '0')}`, r.caduca ?? null)
    .run();
}

export const mensualesDe = (grupo: number, mes: string, estado?: string) =>
  (env.DB.base.prepare(`SELECT count(*) AS n FROM reservas WHERE tipo = 'clase_mensual' AND grupo_id = ? AND mes = ? ${estado ? `AND estado = '${estado}'` : ''}`)
    .get(grupo, mes) as { n: number }).n;

/** Marca la clase del grupo como desactivada (clases.activa = 0), con el grupo seguiendo activo. */
export const desactivarClaseDe = (grupo: number) =>
  env.DB.exec(`UPDATE clases SET activa = 0 WHERE id = (SELECT clase_id FROM grupos WHERE id = ${Number(grupo)})`);
