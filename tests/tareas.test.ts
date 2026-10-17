import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from './apoyo/cloudflare-workers';
import { enviar } from '../src/lib/email';
import {
  agendaSemana, construirTareas, contarPendientes, contarUrgentes, diasEntre, ejecutarAccion, mensajeHecho, repartir, sumarDias,
  tareasDeHoy, type Tarea,
} from '../src/lib/tareas';
import { cambiarEstadoSolicitud, cambiarEstadoTallerista, marcarPagoReserva } from '../src/lib/acciones';
import { diaSemana } from '../src/lib/util';

// Los emails no salen: se cuentan las llamadas a enviar().
vi.mock('../src/lib/email', () => ({ enviar: vi.fn() }));

// Fecha de mentira muy lejana: liberarCaducadas() compara con el reloj real de SQLite (strftime 'now'), así que los plazos
// «futuros» de estos tests tienen que ser posteriores a hoy de verdad. Solo se falsea Date (JS), no los temporizadores.
const AHORA = '2099-10-17T10:00:00Z'; // 12:00 en España
const HOY = '2099-10-17';
const dia = (n: number) => sumarDias(HOY, n);
const mes = (n: number) => dia(n).slice(0, 7);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(AHORA));
  vi.mocked(enviar).mockClear();
  env.DB.exec('DELETE FROM reservas; DELETE FROM talleres; DELETE FROM talleristas; DELETE FROM solicitudes; DELETE FROM grupos; DELETE FROM clases;');
});
afterEach(() => vi.useRealTimers());

// ---------- Preparación de datos ----------

const sql = (texto: string) => env.DB.exec(texto);
const q = (v: string | number | null | undefined) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

function tallerista(id: number, o: { nombre?: string; marca?: string | null; telefono?: string | null; email?: string; estado?: string; creado?: string } = {}) {
  sql(`INSERT INTO talleristas (id, nombre, marca, email, telefono, propuesta, estado, creado_en)
       VALUES (${id}, ${q(o.nombre ?? `Tallerista ${id}`)}, ${q(o.marca === undefined ? `Marca ${id}` : o.marca)}, ${q(o.email ?? `t${id}@ejemplo.es`)},
       ${q(o.telefono === undefined ? '600000000' : o.telefono)}, 'Propuesta', ${q(o.estado ?? 'aceptada')}, ${q(o.creado ?? `${dia(-1)}T10:00:00`)})`);
}
type OpcionesTaller = {
  id: number; fecha: string; estado?: string; tallerista?: number | null; titulo?: string | null; pago?: number; limite?: string | null;
  plazas?: number; precio?: number | null; codigo?: string | null; completo?: boolean;
};
function taller(o: OpcionesTaller) {
  const completo = o.completo ?? false;
  sql(`INSERT INTO talleres (id, tallerista_id, titulo, slug, fecha, franja, hora_inicio, hora_fin, precio_cent, plazas, foto, texto, datos_pago,
                             estado, pago_reserva_recibido, codigo_enlace, fecha_limite)
       VALUES (${o.id}, ${q(o.tallerista === undefined ? null : o.tallerista)}, ${q(o.titulo === undefined ? null : o.titulo)},
       ${q(o.estado === 'publicado' ? `slug-${o.id}` : null)}, ${q(o.fecha)}, 'sabado_manana', ${q('10:00')}, ${q('12:00')},
       ${q(o.precio === undefined ? 4500 : o.precio)}, ${o.plazas ?? 8}, ${q(completo ? 'foto.jpg' : null)}, ${q(completo ? 'Texto' : null)},
       ${q(completo ? 'Bizum' : null)}, ${q(o.estado ?? 'hueco')}, ${o.pago ?? 0}, ${q(o.codigo === undefined ? `enlace-${o.id}` : o.codigo)}, ${q(o.limite === undefined ? null : o.limite)})`);
}
function reserva(o: {
  id: number; tipo?: 'taller' | 'clase_mensual' | 'clase_suelta'; taller?: number; grupo?: number; mes?: string; sesion?: string;
  estado?: string; caduca?: string | null; nombre?: string; plazas?: number; creado?: string;
}) {
  const tipo = o.tipo ?? 'taller';
  sql(`INSERT INTO reservas (id, tipo, taller_id, grupo_id, mes, fecha_sesion, nombre, telefono, email, plazas, estado, caduca_en, creado_en, codigo)
       VALUES (${o.id}, ${q(tipo)}, ${q(o.taller)}, ${q(o.grupo)}, ${q(o.mes)}, ${q(o.sesion)}, ${q(o.nombre ?? `Cliente ${o.id}`)}, '611111111',
       ${q(`${(o.nombre ?? `Cliente ${o.id}`).toLowerCase().replace(/\s/g, '')}@ejemplo.es`)}, ${o.plazas ?? 1}, ${q(o.estado ?? 'pendiente')}, ${q(o.caduca === undefined ? null : o.caduca)},
       ${q(o.creado ?? `${dia(-1)}T10:00:00`)}, ${q(`cod${o.id}`)})`);
}
function grupo(id: number, o: { diaSemana?: number; plazas?: number; precio?: number; nombre?: string } = {}) {
  sql(`INSERT INTO clases (id, slug, nombre, tipo, precio_suelta_cent) VALUES (${id}, 'clase-${id}', ${q(o.nombre ?? `Clase ${id}`)}, 'prueba', 2000)`);
  sql(`INSERT INTO grupos (id, clase_id, dia_semana, hora_inicio, hora_fin, plazas, publico, precio_mes_cent, activo)
       VALUES (${id}, ${id}, ${o.diaSemana ?? 3}, '18:00', '19:00', ${o.plazas ?? 8}, 'adultos', ${o.precio ?? 5500}, 1)`);
}
function solicitud(o: { id: number; tipo?: 'privado' | 'bono'; estado?: string; creado?: string; fecha?: string | null; nombre?: string }) {
  const tipo = o.tipo ?? 'privado';
  sql(`INSERT INTO solicitudes (id, tipo, nombre, email, telefono, motivo, personas, fecha_aprox, tipo_bono, detalle, estado, notas, creado_en)
       VALUES (${o.id}, ${q(tipo)}, ${q(o.nombre ?? `Cliente ${o.id}`)}, 'x@ejemplo.es', '633333333', ${q(tipo === 'privado' ? 'Despedida' : null)},
       ${tipo === 'privado' ? 10 : 'NULL'}, ${q(o.fecha === undefined ? null : o.fecha)}, ${q(tipo === 'bono' ? 'importe' : null)},
       ${q(tipo === 'bono' ? '50 €' : null)}, ${q(o.estado ?? 'nueva')}, 'Nota privada de Iris', ${q(o.creado ?? `${dia(0)}T08:00:00`)})`);
}

const calcular = () => tareasDeHoy('https://yutori.test');
const bloqueDe = (ts: Tarea[], clave: string) => ts.find((t) => t.clave === clave)?.bloque;
const una = (ts: Tarea[], clave: string) => ts.find((t) => t.clave === clave)!;
const estadoReserva = (id: number) => (env.DB.base.prepare('SELECT estado FROM reservas WHERE id = ?').get(id) as { estado: string }).estado;

// ---------- Reservas ----------

describe('reservas pendientes con plazo (T1)', () => {
  beforeEach(() => taller({ id: 1, fecha: dia(10), estado: 'publicado', titulo: 'Velas', precio: 4500, completo: true, tallerista: null }));

  it('es urgente y dice cuánto le queda, con el importe de sus plazas', async () => {
    reserva({ id: 1, taller: 1, nombre: 'Ana López', plazas: 2, caduca: `${HOY}T15:00:00` });
    const t = una(await calcular(), 'T1-1');
    expect(t.bloque).toBe('urgente');
    expect(t.texto).toBe('Ana López · Velas (2 plazas) · 90 € · le quedan 5 h');
    expect(t.principal).toMatchObject({ tipo: 'post', accion: 'pagado', etiqueta: 'Pago recibido' });
  });
  it('si queda menos de una hora, lo dice en minutos', async () => {
    reserva({ id: 1, taller: 1, caduca: `${HOY}T10:40:00` });
    expect(una(await calcular(), 'T1-1').texto).toContain('le quedan 40 min');
  });
  it('libera las caducadas antes de calcular: ya no son tareas y quedan liberadas', async () => {
    reserva({ id: 1, taller: 1, caduca: '2000-01-01T10:00:00' });
    expect((await calcular()).some((t) => t.clave === 'T1-1')).toBe(false);
    expect(estadoReserva(1)).toBe('liberada');
  });
  it('un taller sin precio no inventa el importe: pone «—»', async () => {
    taller({ id: 2, fecha: dia(10), estado: 'publicado', titulo: 'Sin precio', precio: null, tallerista: null });
    reserva({ id: 1, taller: 2, caduca: `${HOY}T15:00:00` });
    expect(una(await calcular(), 'T1-1').texto).toContain(' · — · ');
  });
  it('una clase mensual con rango de precio enseña el rango', async () => {
    sql(`INSERT INTO clases (id, slug, nombre, tipo) VALUES (50, 'c50', 'Costura', 'prueba')`);
    sql(`INSERT INTO grupos (id, clase_id, dia_semana, hora_inicio, hora_fin, plazas, precio_mes_cent, precio_mes_max_cent) VALUES (50, 50, 3, '18:00', '19:00', 8, 5500, 6500)`);
    reserva({ id: 1, tipo: 'clase_mensual', grupo: 50, mes: mes(0), caduca: `${HOY}T15:00:00` });
    expect(una(await calcular(), 'T1-1').texto).toContain('55-65 €');
  });
});

describe('reservas pendientes sin plazo (T2)', () => {
  beforeEach(() => grupo(1));

  it('de la clase del mes en curso va a «Esta semana»', async () => {
    reserva({ id: 1, tipo: 'clase_mensual', grupo: 1, mes: mes(0) });
    expect(bloqueDe(await calcular(), 'T2-1')).toBe('semana');
  });
  it('de la clase del mes siguiente va a «Cuando puedas»', async () => {
    reserva({ id: 1, tipo: 'clase_mensual', grupo: 1, mes: mes(31) });
    expect(bloqueDe(await calcular(), 'T2-1')).toBe('cuando');
  });
  it('de una clase suelta de mañana es urgente', async () => {
    reserva({ id: 1, tipo: 'clase_suelta', grupo: 1, sesion: dia(1) });
    expect(bloqueDe(await calcular(), 'T2-1')).toBe('urgente');
  });
  it('de un taller de pasado mañana todavía no es urgente', async () => {
    taller({ id: 1, fecha: dia(2), estado: 'publicado', titulo: 'Velas', completo: true });
    reserva({ id: 1, taller: 1 });
    expect(bloqueDe(await calcular(), 'T2-1')).toBe('semana');
  });
  it('una pendiente antigua de un taller que ya pasó sigue visible, en «Cuando puedas»', async () => {
    taller({ id: 1, fecha: dia(-20), estado: 'publicado', titulo: 'Viejo', completo: true });
    reserva({ id: 1, taller: 1, creado: `${dia(-30)}T10:00:00` });
    const t = una(await calcular(), 'T2-1');
    expect(t.bloque).toBe('cuando');
    expect(t.texto).toContain('sin pagar');
  });
  it('usa la fecha de España: a las 23:30 UTC un taller del día siguiente ya es de hoy', async () => {
    taller({ id: 1, fecha: dia(1), estado: 'publicado', titulo: 'Velas', completo: true });
    reserva({ id: 1, taller: 1 });
    vi.setSystemTime(new Date(`${HOY}T23:30:00Z`)); // en España ya es el día 18
    expect(bloqueDe(await calcular(), 'T2-1')).toBe('urgente');
  });
});

describe('plazas liberadas (T3)', () => {
  beforeEach(() => taller({ id: 1, fecha: dia(10), estado: 'publicado', titulo: 'Velas', completo: true }));

  it('avisa de las de los últimos 7 días, sin contarlas como pendientes', async () => {
    reserva({ id: 1, taller: 1, estado: 'liberada', nombre: 'Carla Pérez', caduca: `${dia(-2)}T10:00:00` });
    const ts = await calcular();
    expect(una(ts, 'T3-1').texto).toBe('Se liberó la plaza de Carla (no pagó a tiempo) · Velas');
    expect(una(ts, 'T3-1').bloque).toBe('cuando');
    expect(contarPendientes(ts)).toBe(0);
  });
  it('no avisa de las de hace más de 7 días', async () => {
    reserva({ id: 1, taller: 1, estado: 'liberada', caduca: `${dia(-9)}T10:00:00` });
    expect((await calcular()).some((t) => t.clave === 'T3-1')).toBe(false);
  });
});

// ---------- Peticiones y talleristas ----------

describe('privados y bonos (T4, T5)', () => {
  it('una petición nueva de hoy va a «Esta semana»', async () => {
    solicitud({ id: 1, creado: `${HOY}T08:00:00` });
    const t = una(await calcular(), 'T4-1');
    expect(t.bloque).toBe('semana');
    expect(t.texto).toBe('Taller privado de Cliente · despedida, 10 personas · llegó hoy');
  });
  it('con más de 2 días sin atender pasa a «Urgente»', async () => {
    solicitud({ id: 1, creado: `${dia(-3)}T08:00:00` });
    solicitud({ id: 2, creado: `${dia(-2)}T08:00:00` });
    const ts = await calcular();
    expect(bloqueDe(ts, 'T4-1')).toBe('urgente');
    expect(bloqueDe(ts, 'T4-2')).toBe('semana');
    expect(una(ts, 'T4-1').texto).toContain('llegó hace 3 días');
  });
  it('el bono dice el importe', async () => {
    solicitud({ id: 1, tipo: 'bono', nombre: 'Kike Regalo' });
    expect(una(await calcular(), 'T4-1').texto).toBe('Bono regalo de Kike · 50 € · llegó hoy');
  });
  it('un privado en curso con fecha en 14 días o menos aparece; con más, no', async () => {
    solicitud({ id: 1, estado: 'en_curso', fecha: dia(14) });
    solicitud({ id: 2, estado: 'en_curso', fecha: dia(15) });
    solicitud({ id: 3, estado: 'en_curso', fecha: null });
    solicitud({ id: 4, estado: 'en_curso', fecha: dia(-1) });
    const ts = await calcular();
    expect(bloqueDe(ts, 'T5-1')).toBe('semana');
    expect(ts.filter((t) => t.codigo === 'T5').map((t) => t.clave)).toEqual(['T5-1']);
  });
  it('una petición cerrada no es tarea', async () => {
    solicitud({ id: 1, estado: 'cerrada' });
    expect(await calcular()).toEqual([]);
  });
});

describe('talleristas nuevas (T6)', () => {
  it('van a «Cuando puedas»; las ya revisadas no salen', async () => {
    tallerista(1, { estado: 'nueva', nombre: 'Lucía Prueba' });
    tallerista(2, { estado: 'revision' });
    tallerista(3, { estado: 'aceptada' });
    const ts = await calcular();
    expect(ts.filter((t) => t.codigo === 'T6').map((t) => t.clave)).toEqual(['T6-1']);
    expect(una(ts, 'T6-1')).toMatchObject({ bloque: 'cuando', texto: 'Nueva tallerista: Lucía' });
  });
});

// ---------- Talleres ----------

describe('huecos sin rellenar por la tallerista (T7)', () => {
  beforeEach(() => tallerista(1, { marca: 'Slowly Atelier' }));

  it('con la fecha límite pasada es urgente y lo dice', async () => {
    taller({ id: 1, fecha: dia(30), tallerista: 1, limite: dia(-3) });
    const t = una(await calcular(), 'T7-1');
    expect(t.bloque).toBe('urgente');
    expect(t.texto).toContain('Slowly Atelier aún no ha rellenado su taller del');
    expect(t.texto).toContain('fuera de plazo desde el 14 oct');
  });
  it('con la fecha límite dentro de 7 días va a «Esta semana»; más lejos, a «Cuando puedas»', async () => {
    taller({ id: 1, fecha: dia(30), tallerista: 1, limite: dia(7) });
    taller({ id: 2, fecha: dia(40), tallerista: 1, limite: dia(8) });
    const ts = await calcular();
    expect(bloqueDe(ts, 'T7-1')).toBe('semana');
    expect(bloqueDe(ts, 'T7-2')).toBe('cuando');
  });
  it('sin fecha límite va a «Cuando puedas»', async () => {
    taller({ id: 1, fecha: dia(30), tallerista: 1, limite: null });
    expect(bloqueDe(await calcular(), 'T7-1')).toBe('cuando');
  });
  it('si el taller es en 7 días o menos es urgente aunque el plazo no haya pasado', async () => {
    taller({ id: 1, fecha: dia(7), tallerista: 1, limite: dia(5) });
    expect(bloqueDe(await calcular(), 'T7-1')).toBe('urgente');
  });
  it('el botón recuerda por WhatsApp con su enlace privado', async () => {
    taller({ id: 1, fecha: dia(30), tallerista: 1, limite: dia(-3), codigo: 'abc123' });
    const a = una(await calcular(), 'T7-1').principal;
    expect(a).toMatchObject({ tipo: 'enlace', etiqueta: 'Recordar por WhatsApp', externo: true });
    const href = (a as { href: string }).href;
    expect(href).toMatch(/^https:\/\/wa\.me\/34600000000\?text=/);
    expect(decodeURIComponent(href)).toContain('https://yutori.test/t/abc123');
  });
  it('sin teléfono recuerda por email, y sin ninguno abre la ficha', async () => {
    tallerista(2, { telefono: null });
    tallerista(3, { telefono: null, email: '' });
    taller({ id: 1, fecha: dia(30), tallerista: 2, limite: dia(-3) });
    taller({ id: 2, fecha: dia(31), tallerista: 3, limite: dia(-3) });
    const ts = await calcular();
    expect(una(ts, 'T7-1').principal).toMatchObject({ etiqueta: 'Recordar por email' });
    expect(una(ts, 'T7-2').principal).toMatchObject({ tipo: 'enlace', etiqueta: 'Abrir', href: '/panel/talleres/2' });
  });
  it('un hueco que ya pasó no es tarea', async () => {
    taller({ id: 1, fecha: dia(-2), tallerista: 1, limite: dia(-30) });
    expect(await calcular()).toEqual([]);
  });
});

describe('hueco propio sin rellenar (T8)', () => {
  it('es «Cuando puedas» y pasa a urgente si es en 7 días o menos', async () => {
    taller({ id: 1, fecha: dia(20), tallerista: null });
    taller({ id: 2, fecha: dia(1), tallerista: null });
    const ts = await calcular();
    expect(bloqueDe(ts, 'T8-1')).toBe('cuando');
    expect(bloqueDe(ts, 'T8-2')).toBe('urgente');
    expect(una(ts, 'T8-2').texto).toMatch(/^Rellena tu taller del .* \(mañana\)$/);
  });
});

describe('25 € de la reserva (T9)', () => {
  beforeEach(() => tallerista(1, { marca: 'Slowly Atelier' }));

  it('salen en «Esta semana» solo de talleres de hoy en adelante y con tallerista', async () => {
    taller({ id: 1, fecha: dia(0), tallerista: 1, estado: 'enviado', titulo: 'A', pago: 0 });
    taller({ id: 2, fecha: dia(-1), tallerista: 1, estado: 'publicado', titulo: 'B', pago: 0 });
    taller({ id: 3, fecha: dia(5), tallerista: null, estado: 'enviado', titulo: 'C', pago: 0 });
    taller({ id: 4, fecha: dia(5), tallerista: 1, estado: 'enviado', titulo: 'D', pago: 1 });
    taller({ id: 5, fecha: dia(5), tallerista: 1, estado: 'desactivado', titulo: 'E', pago: 0 });
    const ts = await calcular();
    expect(ts.filter((t) => t.codigo === 'T9').map((t) => t.clave)).toEqual(['T9-1']);
    expect(una(ts, 'T9-1')).toMatchObject({ bloque: 'semana', principal: { accion: 'veinticinco', etiqueta: '25 € recibidos' } });
  });
});

describe('taller enviado sin publicar (T10, T11)', () => {
  beforeEach(() => tallerista(1, { marca: 'Slowly Atelier' }));

  it('va a «Esta semana» con el botón de publicar', async () => {
    taller({ id: 1, fecha: dia(20), tallerista: 1, estado: 'enviado', titulo: 'Velas de soja', pago: 1 });
    const t = una(await calcular(), 'T10-1');
    expect(t.bloque).toBe('semana');
    expect(t.texto).toBe('Slowly Atelier ha enviado su taller: Velas de soja');
    expect(t.principal).toMatchObject({ accion: 'publicar', etiqueta: 'Publicar en la web' });
  });
  it('si el taller es en 7 días o menos y sigue sin publicar es urgente', async () => {
    taller({ id: 1, fecha: dia(7), tallerista: 1, estado: 'enviado', titulo: 'Velas de soja', pago: 1 });
    expect(bloqueDe(await calcular(), 'T10-1')).toBe('urgente');
  });
  it('uno ya publicado no es tarea', async () => {
    taller({ id: 1, fecha: dia(3), tallerista: 1, estado: 'publicado', titulo: 'Velas', pago: 1, completo: true });
    expect(await calcular()).toEqual([]);
  });
});

describe('renovar alumnas (T12)', () => {
  beforeEach(() => {
    grupo(1);
    reserva({ id: 1, tipo: 'clase_mensual', grupo: 1, mes: '2099-10', estado: 'confirmada', nombre: 'Flor' });
    reserva({ id: 2, tipo: 'clase_mensual', grupo: 1, mes: '2099-10', estado: 'confirmada', nombre: 'Gala' });
  });

  it('no sale antes del día 20', async () => {
    expect((await calcular()).some((t) => t.codigo === 'T12')).toBe(false);
  });
  it('desde el día 20 ofrece renovar a las que aún no tienen su plaza del mes siguiente', async () => {
    reserva({ id: 3, tipo: 'clase_mensual', grupo: 1, mes: '2099-11', estado: 'pendiente', nombre: 'Flor' }); // Flor ya renovada
    vi.setSystemTime(new Date('2099-10-20T10:00:00Z'));
    const t = una(await calcular(), 'T12');
    expect(t.bloque).toBe('semana');
    expect(t.texto).toBe('Renueva a tus alumnas para noviembre (2 confirmadas en octubre)');
    expect(t.principal).toMatchObject({ accion: 'renovar', etiqueta: 'Renovar alumnas (1)' });
  });
  it('si ya están todas renovadas, desaparece', async () => {
    reserva({ id: 3, tipo: 'clase_mensual', grupo: 1, mes: '2099-11', estado: 'pendiente', nombre: 'Flor' });
    reserva({ id: 4, tipo: 'clase_mensual', grupo: 1, mes: '2099-11', estado: 'confirmada', nombre: 'Gala' });
    vi.setSystemTime(new Date('2099-10-20T10:00:00Z'));
    expect((await calcular()).some((t) => t.codigo === 'T12')).toBe(false);
  });
});

it('sin nada pendiente no hay tareas', async () => {
  expect(await calcular()).toEqual([]);
});

// ---------- Reparto en bloques ----------

describe('repartir en bloques', () => {
  beforeEach(() => {
    taller({ id: 1, fecha: dia(10), estado: 'publicado', titulo: 'Velas', completo: true });
    taller({ id: 2, fecha: dia(11), estado: 'publicado', titulo: 'Cuadernos', completo: true });
  });
  const pendientes = (desde: number, n: number, tallerId: number) => {
    for (let i = 0; i < n; i++) reserva({ id: desde + i, taller: tallerId, caduca: `${HOY}T1${i}:00:00`, nombre: `Cliente ${desde + i}` });
  };

  it('enseña como mucho 5 líneas por bloque y cuenta el total real', async () => {
    pendientes(1, 7, 1);
    const [urgente] = repartir(await calcular());
    expect(urgente).toMatchObject({ clave: 'urgente', total: 7, lineas: 7, ocultas: 2 });
    expect(urgente.grupos.flatMap((g) => g.tareas)).toHaveLength(5);
  });
  it('con Infinity enseña todas', async () => {
    pendientes(1, 7, 1);
    expect(repartir(await calcular(), Infinity)[0].ocultas).toBe(0);
  });
  it('junta las del mismo taller con su título, y deja sin título al que está solo', async () => {
    pendientes(1, 2, 1);
    pendientes(10, 1, 2);
    const [urgente] = repartir(await calcular());
    expect(urgente.grupos.map((g) => [g.titulo?.split(' · ')[0] ?? null, g.tareas.length])).toEqual([['Velas', 2], [null, 1]]);
  });
  it('los bloques vacíos no salen y el orden es urgente, esta semana, cuando puedas', async () => {
    taller({ id: 3, fecha: dia(40), estado: 'publicado', titulo: 'Lejano', completo: true });
    reserva({ id: 1, taller: 3 }); // sin plazo y de otro mes: «Cuando puedas»
    solicitud({ id: 1 }); // nueva de hoy: «Esta semana»
    reserva({ id: 2, taller: 1, caduca: `${HOY}T15:00:00` }); // urgente
    expect(repartir(await calcular()).map((b) => b.clave)).toEqual(['urgente', 'semana', 'cuando']);
    sql('DELETE FROM reservas');
    expect(repartir(await calcular()).map((b) => b.clave)).toEqual(['semana']);
  });
  it('cuenta pendientes y urgentes sin contar las informativas', async () => {
    reserva({ id: 1, taller: 1, caduca: `${HOY}T15:00:00` });
    reserva({ id: 2, taller: 1, estado: 'liberada', caduca: `${dia(-1)}T10:00:00` });
    solicitud({ id: 1 });
    const ts = await calcular();
    expect(contarPendientes(ts)).toBe(2);
    expect(contarUrgentes(ts)).toBe(1);
  });
  it('dentro de un bloque ordena por urgencia: el plazo más corto primero', async () => {
    reserva({ id: 1, taller: 1, caduca: `${HOY}T20:00:00`, nombre: 'Tarde' });
    reserva({ id: 2, taller: 2, caduca: `${HOY}T11:00:00`, nombre: 'Pronto' });
    const claves = repartir(await calcular())[0].grupos.flatMap((g) => g.tareas.map((t) => t.clave));
    expect(claves).toEqual(['T1-2', 'T1-1']);
  });
  it('construirTareas funciona con datos ya leídos, sin base de datos', () => {
    const ts = construirTareas({
      pendientes: [], liberadas: [], talleres: [], solicitudes: [], talleristas: [{ id: 9, nombre: 'Ana Gil', categoria: 'Bordado', creado_en: `${HOY}T08:00:00` }],
      renovacion: { confirmadas: 0, sinRenovar: 0 },
    }, { hoy: HOY, ahora: new Date(AHORA), origen: '' });
    expect(ts.map((t) => t.texto)).toEqual(['Nueva tallerista: Ana · Bordado']);
  });
});

// ---------- Acciones de un toque ----------

describe('marcar los 25 € (sin interruptor)', () => {
  beforeEach(() => taller({ id: 1, fecha: dia(5), tallerista: null, pago: 0 }));
  const pago = () => (env.DB.base.prepare('SELECT pago_reserva_recibido AS p FROM talleres WHERE id = 1').get() as { p: number }).p;

  it('pulsarlo dos veces los deja recibidos (no los deshace)', async () => {
    expect(await marcarPagoReserva(1)).toBe(true);
    expect(await marcarPagoReserva(1)).toBe(false);
    expect(pago()).toBe(1);
  });
  it('la acción de la portada también es idempotente', async () => {
    await ejecutarAccion('veinticinco', 1);
    const segunda = await ejecutarAccion('veinticinco', 1);
    expect(segunda.ok).toBe(true);
    expect(pago()).toBe(1);
  });
  it('se pueden marcar como no recibidos pidiéndolo de forma explícita', async () => {
    await marcarPagoReserva(1, true);
    await marcarPagoReserva(1, false);
    expect(pago()).toBe(0);
  });
});

describe('cambiar el estado sin tocar las notas', () => {
  it('de una petición: pasa a en curso y conserva sus notas', async () => {
    solicitud({ id: 1 });
    expect(await cambiarEstadoSolicitud(1, 'en_curso')).toBe(true);
    expect(env.DB.base.prepare('SELECT estado, notas FROM solicitudes WHERE id = 1').get()).toMatchObject({ estado: 'en_curso', notas: 'Nota privada de Iris' });
  });
  it('de una tallerista: pasa a revisión y conserva sus notas', async () => {
    tallerista(1, { estado: 'nueva' });
    sql(`UPDATE talleristas SET notas = 'Muy buena propuesta' WHERE id = 1`);
    expect(await cambiarEstadoTallerista(1, 'revision')).toBe(true);
    expect(env.DB.base.prepare('SELECT estado, notas FROM talleristas WHERE id = 1').get()).toMatchObject({ estado: 'revision', notas: 'Muy buena propuesta' });
  });
  it('rechaza un estado que no existe', async () => {
    solicitud({ id: 1 });
    expect(await cambiarEstadoSolicitud(1, 'inventado')).toBe(false);
    expect(await cambiarEstadoTallerista(1, 'inventado')).toBe(false);
  });
  it('con «desde», una pantalla vieja no pisa un cambio hecho desde otro dispositivo', async () => {
    tallerista(1, { estado: 'aceptada' }); // Iris ya la aceptó en otro dispositivo
    solicitud({ id: 1, estado: 'cerrada' });
    await ejecutarAccion('en_revision', 1);
    await ejecutarAccion('en_curso', 1);
    expect(env.DB.base.prepare('SELECT estado FROM talleristas WHERE id = 1').get()).toMatchObject({ estado: 'aceptada' });
    expect(env.DB.base.prepare('SELECT estado FROM solicitudes WHERE id = 1').get()).toMatchObject({ estado: 'cerrada' });
  });
});

describe('«Pago recibido» desde la portada', () => {
  beforeEach(() => taller({ id: 1, fecha: dia(10), estado: 'publicado', titulo: 'Velas', completo: true }));

  it('confirma la reserva y envía el email una sola vez aunque se toque dos veces', async () => {
    reserva({ id: 1, taller: 1, caduca: `${HOY}T15:00:00`, nombre: 'Ana López' });
    const primera = await ejecutarAccion('pagado', 1);
    const segunda = await ejecutarAccion('pagado', 1);
    expect(primera).toEqual({ ok: true, hecho: 'pago', de: 'Ana' });
    expect(segunda.ok).toBe(true);
    expect(estadoReserva(1)).toBe('confirmada');
    expect(enviar).toHaveBeenCalledTimes(1);
    expect((await calcular()).some((t) => t.clave === 'T1-1')).toBe(false);
  });
  it('si la plaza ya se había liberado, no la confirma y lo dice', async () => {
    reserva({ id: 1, taller: 1, estado: 'liberada', caduca: `${dia(-1)}T10:00:00` });
    const r = await ejecutarAccion('pagado', 1);
    expect(r.ok).toBe(false);
    expect(estadoReserva(1)).toBe('liberada');
    expect(enviar).not.toHaveBeenCalled();
  });
  it('una reserva que ya no existe da un error claro', async () => {
    expect(await ejecutarAccion('pagado', 99)).toMatchObject({ ok: false });
  });
});

describe('publicar desde la portada', () => {
  beforeEach(() => tallerista(1));

  it('sin los 25 € no publica y dice el motivo', async () => {
    taller({ id: 1, fecha: dia(20), tallerista: 1, estado: 'enviado', titulo: 'Velas', pago: 0, completo: true });
    const r = await ejecutarAccion('publicar', 1);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.errores.join(' ')).toContain('25 €');
    expect(env.DB.base.prepare('SELECT estado FROM talleres WHERE id = 1').get()).toMatchObject({ estado: 'enviado' });
  });
  it('con todo en regla lo publica y desaparece de las tareas', async () => {
    taller({ id: 1, fecha: dia(20), tallerista: 1, estado: 'enviado', titulo: 'Velas', pago: 1, completo: true });
    expect(await ejecutarAccion('publicar', 1)).toEqual({ ok: true, hecho: 'publicado', de: 'Velas' });
    expect(env.DB.base.prepare('SELECT estado FROM talleres WHERE id = 1').get()).toMatchObject({ estado: 'publicado' });
    expect((await calcular()).some((t) => t.codigo === 'T10')).toBe(false);
  });
});

describe('renovar desde la portada', () => {
  it('crea las plazas pendientes del mes siguiente y dice cuántas', async () => {
    grupo(1);
    reserva({ id: 1, tipo: 'clase_mensual', grupo: 1, mes: '2099-10', estado: 'confirmada', nombre: 'Flor' });
    vi.setSystemTime(new Date('2099-10-20T10:00:00Z'));
    expect(await ejecutarAccion('renovar', 0)).toEqual({ ok: true, hecho: 'renovadas', de: '1' });
    expect(await ejecutarAccion('renovar', 0)).toEqual({ ok: true, hecho: 'renovadas', de: '0' });
  });
});

it('una acción desconocida o sin id válido da error', async () => {
  expect(await ejecutarAccion('borrar_todo', 1)).toMatchObject({ ok: false });
  expect(await ejecutarAccion('pagado', Number.NaN)).toMatchObject({ ok: false });
});

it('«Hecho: …» usa los textos aprobados', () => {
  expect(mensajeHecho('pago', 'Ana')).toBe('Hecho: pago de Ana recibido.');
  expect(mensajeHecho('veinticinco', 'Slowly Atelier')).toBe('Hecho: 25 € de Slowly Atelier recibidos.');
  expect(mensajeHecho('inventado', 'x')).toBeNull();
});

// ---------- Agenda ----------

describe('agenda de la semana', () => {
  it('enseña talleres con plazas y sin pagar, y solo los días con algo', async () => {
    taller({ id: 1, fecha: dia(2), estado: 'publicado', titulo: 'Velas', plazas: 8, completo: true });
    reserva({ id: 1, taller: 1, estado: 'confirmada', plazas: 3 });
    reserva({ id: 2, taller: 1, estado: 'pendiente', plazas: 2, caduca: `${dia(1)}T10:00:00` });
    reserva({ id: 3, taller: 1, estado: 'cancelada' });
    const a = await agendaSemana(HOY);
    expect(a).toHaveLength(1);
    expect(a[0].fecha).toBe(dia(2));
    expect(a[0].eventos[0]).toMatchObject({ tipo: 'taller', titulo: 'Velas', ocupadas: 5, plazas: 8, sinPagar: 2 });
  });
  it('va de hoy a hoy+6: lo de hoy+7 no sale', async () => {
    taller({ id: 1, fecha: dia(6), estado: 'publicado', titulo: 'Sí', completo: true });
    taller({ id: 2, fecha: dia(7), estado: 'publicado', titulo: 'No', completo: true });
    expect((await agendaSemana(HOY)).map((d) => d.fecha)).toEqual([dia(6)]);
  });
  it('no incluye huecos ni talleres sin publicar', async () => {
    taller({ id: 1, fecha: dia(1), estado: 'hueco' });
    taller({ id: 2, fecha: dia(1), estado: 'enviado', titulo: 'X' });
    expect(await agendaSemana(HOY)).toEqual([]);
  });
  it('marca hoy y mañana', async () => {
    taller({ id: 1, fecha: dia(0), estado: 'publicado', titulo: 'A', completo: true });
    taller({ id: 2, fecha: dia(1), estado: 'publicado', titulo: 'B', completo: true });
    taller({ id: 3, fecha: dia(3), estado: 'publicado', titulo: 'C', completo: true });
    const a = await agendaSemana(HOY);
    expect(a.map((d) => [d.etiqueta, d.hoy, d.manana])).toEqual([['Hoy', true, false], ['Mañana', false, true], [expect.any(String), false, false]]);
  });
  it('las clases salen el día de la semana de su horario, con alumnas, sueltas y sin pagar', async () => {
    const objetivo = dia(2);
    grupo(1, { diaSemana: diaSemana(objetivo), plazas: 8, nombre: 'Costura' });
    reserva({ id: 1, tipo: 'clase_mensual', grupo: 1, mes: objetivo.slice(0, 7), estado: 'confirmada' });
    reserva({ id: 2, tipo: 'clase_mensual', grupo: 1, mes: objetivo.slice(0, 7), estado: 'pendiente' });
    reserva({ id: 3, tipo: 'clase_suelta', grupo: 1, sesion: objetivo, estado: 'pendiente' });
    reserva({ id: 4, tipo: 'clase_suelta', grupo: 1, sesion: dia(9), estado: 'pendiente' });
    const a = await agendaSemana(HOY);
    const dias = a.map((d) => d.fecha);
    expect(dias).toContain(objetivo);
    expect(dias.every((d) => diasEntre(HOY, d) <= 6)).toBe(true);
    const clase = a.find((d) => d.fecha === objetivo)!.eventos[0];
    expect(clase).toMatchObject({ tipo: 'clase', titulo: 'Costura', ocupadas: 2, sueltas: 1, sinPagar: 2 });
  });
});
