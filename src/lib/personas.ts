// Personas (el CRM del panel): alumnas, talleristas y quien pide privados o bonos, juntadas por email.
// No hay tabla propia: se calcula a partir de reservas, talleristas y solicitudes, así nunca se desincroniza.
import { todos } from './db';
import { meses } from './clases';

export type Etiqueta = 'mensual' | 'clases' | 'talleres' | 'tallerista' | 'privado' | 'bono';
export const ETIQUETAS: Record<Etiqueta, string> = {
  mensual: 'Alumna mensual', clases: 'Clases sueltas', talleres: 'Talleres', tallerista: 'Tallerista', privado: 'Taller privado', bono: 'Bono regalo',
};

export type Persona = {
  email: string; nombre: string; telefono: string | null; etiquetas: Etiqueta[];
  reservas: number; gastoCent: number; pendientes: number; primera: string; ultima: string;
  tallerista: { id: number; estado: string; marca: string | null } | null; solicitudes: number;
};

/** Importe de una reserva: el guardado al reservar o, en las antiguas, el precio de su taller o clase. */
const IMPORTE = `COALESCE(r.importe_cent, CASE r.tipo WHEN 'taller' THEN t.precio_cent * r.plazas
  WHEN 'clase_suelta' THEN c.precio_suelta_cent ELSE g.precio_mes_cent END, 0)`;

/** Todas las personas, de la que tuvo actividad más reciente a la más antigua. */
export async function listarPersonas(): Promise<Persona[]> {
  const { actual } = meses();
  const [reservas, talleristas, solicitudes] = await Promise.all([
    todos<{ email: string; nombre: string; telefono: string; reservas: number; gasto: number; pendientes: number; primera: string; ultima: string;
            mensual: number; sueltas: number; talleres: number }>(`
      SELECT lower(r.email) AS email, max(r.nombre) AS nombre, max(r.telefono) AS telefono, count(*) AS reservas,
             sum(CASE WHEN r.estado = 'confirmada' THEN ${IMPORTE} ELSE 0 END) AS gasto,
             sum(r.estado = 'pendiente') AS pendientes, min(r.creado_en) AS primera, max(r.creado_en) AS ultima,
             sum(r.tipo = 'clase_mensual' AND r.mes >= ?1) AS mensual, sum(r.tipo = 'clase_suelta') AS sueltas, sum(r.tipo = 'taller') AS talleres
      FROM reservas r LEFT JOIN talleres t ON t.id = r.taller_id
      LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id
      WHERE r.estado IN ('pendiente', 'confirmada') AND r.email <> ''
      GROUP BY lower(r.email)`, actual),
    todos<{ id: number; email: string; nombre: string; marca: string | null; telefono: string | null; estado: string; creado_en: string }>(
      `SELECT id, lower(email) AS email, nombre, marca, telefono, estado, creado_en FROM talleristas WHERE email <> ''`),
    todos<{ email: string; nombre: string; telefono: string | null; privados: number; bonos: number; n: number; primera: string; ultima: string }>(`
      SELECT lower(email) AS email, max(nombre) AS nombre, max(telefono) AS telefono, sum(tipo = 'privado') AS privados,
             sum(tipo = 'bono') AS bonos, count(*) AS n, min(creado_en) AS primera, max(creado_en) AS ultima
      FROM solicitudes WHERE email <> '' GROUP BY lower(email)`),
  ]);

  const personas = new Map<string, Persona>();
  const persona = (email: string, nombre: string, telefono: string | null, cuando: string) => {
    const p = personas.get(email) ?? {
      email, nombre, telefono, etiquetas: [], reservas: 0, gastoCent: 0, pendientes: 0, primera: cuando, ultima: cuando, tallerista: null, solicitudes: 0,
    };
    p.telefono ??= telefono;
    if (cuando < p.primera) p.primera = cuando;
    if (cuando > p.ultima) p.ultima = cuando;
    personas.set(email, p);
    return p;
  };
  for (const r of reservas) {
    const p = persona(r.email, r.nombre, r.telefono, r.primera);
    if (r.ultima > p.ultima) p.ultima = r.ultima;
    Object.assign(p, { reservas: r.reservas, gastoCent: r.gasto, pendientes: r.pendientes });
    if (r.mensual) p.etiquetas.push('mensual');
    if (r.sueltas) p.etiquetas.push('clases');
    if (r.talleres) p.etiquetas.push('talleres');
  }
  for (const t of talleristas) {
    // La tallerista se muestra con su nombre aunque haya reservado con otro.
    const p = persona(t.email, t.nombre, t.telefono, t.creado_en);
    p.nombre = t.nombre;
    p.tallerista = { id: t.id, estado: t.estado, marca: t.marca };
    p.etiquetas.push('tallerista');
  }
  for (const s of solicitudes) {
    const p = persona(s.email, s.nombre, s.telefono, s.primera);
    if (s.ultima > p.ultima) p.ultima = s.ultima;
    p.solicitudes = s.n;
    if (s.privados) p.etiquetas.push('privado');
    if (s.bonos) p.etiquetas.push('bono');
  }
  return [...personas.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
}

export type Movimiento = {
  cuando: string; tipo: 'reserva' | 'solicitud'; titulo: string; detalle: string; estado: string; importeCent: number | null; href: string;
};

/** Historial de una persona (sus reservas y peticiones), de lo más reciente a lo más antiguo. */
export async function historialDe(email: string): Promise<Movimiento[]> {
  const [reservas, solicitudes] = await Promise.all([
    todos<{ id: number; tipo: string; titulo: string; mes: string | null; fecha: string | null; estado: string; importe: number; creado_en: string;
            plazas: number; primera_vez: number | null; metodo_pago: string | null }>(`
      SELECT r.id, r.tipo, COALESCE(t.titulo, c.nombre, 'Reserva') AS titulo, r.mes, COALESCE(t.fecha, r.fecha_sesion) AS fecha, r.estado,
             ${IMPORTE} AS importe, r.creado_en, r.plazas, r.primera_vez, r.metodo_pago
      FROM reservas r LEFT JOIN talleres t ON t.id = r.taller_id
      LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id
      WHERE lower(r.email) = ?1 ORDER BY r.creado_en DESC`, email),
    todos<{ id: number; tipo: string; motivo: string | null; detalle: string | null; estado: string; creado_en: string }>(
      `SELECT id, tipo, motivo, detalle, estado, creado_en FROM solicitudes WHERE lower(email) = ?1 ORDER BY creado_en DESC`, email),
  ]);
  const movimientos: Movimiento[] = [
    ...reservas.map((r): Movimiento => ({
      cuando: r.creado_en, tipo: 'reserva', titulo: r.titulo, estado: r.estado, importeCent: r.importe, href: `/panel/reservas/${r.id}`,
      detalle: [
        r.tipo === 'clase_mensual' ? `Mensual · ${r.mes}` : r.tipo === 'clase_suelta' ? `Clase suelta · ${r.fecha}` : `Taller · ${r.fecha}`,
        r.plazas > 1 ? `${r.plazas} plazas` : '',
        r.metodo_pago === 'tarjeta' ? 'tarjeta' : r.metodo_pago === 'efectivo' ? 'efectivo' : '',
        r.primera_vez ? '1ª vez' : '',
      ].filter(Boolean).join(' · '),
    })),
    ...solicitudes.map((s): Movimiento => ({
      cuando: s.creado_en, tipo: 'solicitud', titulo: s.tipo === 'privado' ? `Taller privado${s.motivo ? `: ${s.motivo}` : ''}` : 'Bono regalo',
      detalle: s.detalle ?? '', estado: s.estado, importeCent: null, href: `/panel/solicitudes/${s.id}`,
    })),
  ];
  return movimientos.sort((a, b) => b.cuando.localeCompare(a.cuando));
}
