-- Fase 1 · Bloque 2: las 7 tablas de Yutori.
-- Importes en céntimos (INTEGER) para evitar decimales. Fechas en texto ISO (AAAA-MM-DD / AAAA-MM-DDTHH:MM).

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE talleristas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  marca TEXT,
  instagram TEXT,
  email TEXT NOT NULL,
  telefono TEXT,
  categoria_id INTEGER REFERENCES categorias(id),
  propuesta TEXT NOT NULL,
  fotos TEXT NOT NULL DEFAULT '[]',            -- JSON con las rutas de las fotos (R2)
  ha_impartido INTEGER,                          -- 1 sí, 0 no
  autonoma INTEGER,                              -- 1 sí, 0 no
  estado TEXT NOT NULL DEFAULT 'nueva'
    CHECK (estado IN ('nueva', 'revision', 'aceptada', 'reserva', 'descartada')),
  notas TEXT,
  acepta_privacidad_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
);
CREATE INDEX talleristas_estado ON talleristas (estado);
CREATE INDEX talleristas_categoria ON talleristas (categoria_id);

CREATE TABLE talleres (
  id INTEGER PRIMARY KEY,
  tallerista_id INTEGER REFERENCES talleristas(id),   -- NULL = lo imparte Iris
  titulo TEXT,
  slug TEXT UNIQUE,
  fecha TEXT NOT NULL,
  franja TEXT NOT NULL
    CHECK (franja IN ('viernes_tarde', 'sabado_manana', 'sabado_tarde', 'domingo_manana', 'domingo_tarde')),
  hora_inicio TEXT,
  hora_fin TEXT,
  precio_cent INTEGER,
  plazas INTEGER NOT NULL DEFAULT 8,
  foto TEXT,
  texto TEXT,
  es_evento INTEGER NOT NULL DEFAULT 0,
  datos_pago TEXT,                                  -- cómo pagar a quien cobra (p. ej. Bizum)
  estado TEXT NOT NULL DEFAULT 'hueco'
    CHECK (estado IN ('hueco', 'enviado', 'publicado', 'desactivado')),
  pago_reserva_recibido INTEGER NOT NULL DEFAULT 0, -- los 25 € de la tallerista
  codigo_enlace TEXT UNIQUE,                        -- enlace privado de la tallerista
  fecha_limite TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
);
CREATE INDEX talleres_fecha ON talleres (fecha);
CREATE INDEX talleres_estado ON talleres (estado);

CREATE TABLE clases (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  texto TEXT,
  precio_mes_cent INTEGER,
  precio_suelta_cent INTEGER,
  modalidades TEXT NOT NULL DEFAULT '[]',        -- JSON, p. ej. ["Con máquina","Sin máquina"]
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE grupos (
  id INTEGER PRIMARY KEY,
  clase_id INTEGER NOT NULL REFERENCES clases(id),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),  -- 1 lunes … 7 domingo
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  plazas INTEGER NOT NULL DEFAULT 8,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX grupos_clase ON grupos (clase_id);

CREATE TABLE reservas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('taller', 'clase_mensual', 'clase_suelta')),
  taller_id INTEGER REFERENCES talleres(id),
  grupo_id INTEGER REFERENCES grupos(id),
  fecha_sesion TEXT,          -- clase suelta: el día concreto
  mes TEXT,                   -- clase mensual: AAAA-MM
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  plazas INTEGER NOT NULL DEFAULT 1,
  modalidad TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmada', 'liberada', 'cancelada')),
  caduca_en TEXT,
  acepta_condiciones_en TEXT,
  acepta_privacidad_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
  CHECK ((tipo = 'taller' AND taller_id IS NOT NULL) OR (tipo <> 'taller' AND grupo_id IS NOT NULL))
);
CREATE INDEX reservas_taller ON reservas (taller_id);
CREATE INDEX reservas_grupo ON reservas (grupo_id);
CREATE INDEX reservas_estado ON reservas (estado);

CREATE TABLE solicitudes (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('privado', 'bono')),
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  motivo TEXT,                -- privado: despedida, cumpleaños…
  categoria_id INTEGER REFERENCES categorias(id),
  fecha_aprox TEXT,
  personas INTEGER,
  tipo_bono TEXT CHECK (tipo_bono IN ('taller', 'importe')),
  detalle TEXT,               -- bono: taller concreto o importe
  para_quien TEXT,
  mensaje TEXT,
  estado TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'en_curso', 'cerrada')),
  acepta_privacidad_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
);
CREATE INDEX solicitudes_estado ON solicitudes (estado);
