-- SOLO PARA PROBAR EN LOCAL: casos extra para la portada «Hoy» del panel (urgentes, plazos, peticiones atrasadas…).
-- Va DESPUÉS de scripts/ejemplo-local.sql (usa sus talleristas 1 y 2 y sus grupos 1, 4 y 7; sus talleres se buscan por slug). Nunca se aplica en internet.
--   npm run db:ejemplo
--   npx wrangler d1 execute yutori --local --file scripts/ejemplo-panel.sql
-- Las fechas son relativas a hoy, así que sirve cualquier día. Ojo: añade talleres publicados, que salen en la web pública
-- (no compares textos con scripts/textos.mjs con estos datos cargados).

INSERT INTO talleristas (nombre, marca, instagram, email, telefono, categoria_id, propuesta, ha_impartido, autonoma, estado, creado_en) VALUES
  ('Irene Prueba', 'Lana y Luna', '@lanayluna', 'irene@ejemplo.com', '600000006', 4, 'Ganchillo de amigurumis, 2 h, 40 €', 1, 1, 'nueva', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-1 day')),
  ('Paula Prueba', NULL, '@paula.tinta', 'paula@ejemplo.com', NULL, 8, 'Caligrafía creativa, 2 h', 0, 0, 'nueva', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-3 days'));

INSERT INTO talleres (tallerista_id, titulo, slug, fecha, franja, hora_inicio, hora_fin, precio_cent, plazas, texto, es_evento, datos_pago, estado, pago_reserva_recibido, codigo_enlace, fecha_limite) VALUES
  -- mañana, publicado, con reservas pendientes que caducan pronto (urgentes, agrupadas)
  (1, 'Velas de soja', 'velas-de-soja-panel', date('now', '+1 day'), 'sabado_manana', '10:30', '12:30', 4500, 8, 'Vela de soja con aromas.', 0, 'Bizum 600000001', 'publicado', 1, 'ejemplo-panel-velas-abc', date('now', '-10 days')),
  -- dentro de 3 días, publicado
  (2, 'Mini herbario', 'mini-herbario-panel', date('now', '+3 days'), 'domingo_tarde', '17:00', '19:00', 3500, 6, 'Un herbario de bolsillo.', 0, 'Bizum 600000002', 'publicado', 1, 'ejemplo-panel-herbario-abc', date('now', '-10 days')),
  -- hueco de tallerista con fecha límite pasada y el taller dentro de 5 días (urgente)
  (2, NULL, 'hueco-fuera-de-plazo-panel', date('now', '+5 days'), 'sabado_tarde', NULL, NULL, NULL, 8, NULL, 0, NULL, 'hueco', 0, 'ejemplo-panel-hueco-abc', date('now', '-3 days')),
  -- hueco propio de mañana sin rellenar
  (NULL, NULL, 'hueco-propio-panel', date('now', '+1 day'), 'domingo_manana', NULL, NULL, NULL, 8, NULL, 0, NULL, 'hueco', 0, 'ejemplo-panel-propio-abc', NULL),
  -- enviado dentro de 20 días y sin los 25 €
  (1, 'Bordado de flores', 'bordado-flores-panel', date('now', '+20 days'), 'sabado_manana', '11:00', '13:00', 4000, 8, 'Bordado botánico.', 0, 'Bizum 600000001', 'enviado', 0, 'ejemplo-panel-enviado-abc', date('now', '-1 day'));

INSERT INTO reservas (tipo, taller_id, nombre, telefono, email, plazas, estado, caduca_en, creado_en, codigo) VALUES
  ('taller', (SELECT id FROM talleres WHERE slug = 'velas-de-soja-panel'), 'Ana López', '611000001', 'ana.lopez@ejemplo.com', 2, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', '+5 hours'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-19 hours'), 'panel-r1'),
  ('taller', (SELECT id FROM talleres WHERE slug = 'velas-de-soja-panel'), 'Berta Ruiz', '611000002', 'berta@ejemplo.com', 1, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', '+40 minutes'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-23 hours'), 'panel-r2'),
  ('taller', (SELECT id FROM talleres WHERE slug = 'velas-de-soja-panel'), 'Carmen Vidal', '611000003', 'carmen@ejemplo.com', 1, 'confirmada', NULL, strftime('%Y-%m-%dT%H:%M:%S', 'now', '-2 days'), 'panel-r3'),
  ('taller', (SELECT id FROM talleres WHERE slug = 'mini-herbario-panel'), 'Dolores Pena', '611000004', 'dolores@ejemplo.com', 1, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-15 hours'), 'panel-r4'),
  ('taller', (SELECT id FROM talleres WHERE slug = 'mini-herbario-panel'), 'Elsa Mora', '611000005', 'elsa@ejemplo.com', 2, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', '+12 hours'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-12 hours'), 'panel-r5'),
  ('taller', (SELECT id FROM talleres WHERE slug = 'mini-herbario-panel'), 'Fina Seoane', '611000006', 'fina@ejemplo.com', 1, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', '+20 hours'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-4 hours'), 'panel-r6'),
  ('taller', (SELECT id FROM talleres WHERE slug = 'mini-herbario-panel'), 'Gloria Paz', '611000007', 'gloria@ejemplo.com', 1, 'pendiente', strftime('%Y-%m-%dT%H:%M:%S', 'now', '+22 hours'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-2 hours'), 'panel-r7'),
  -- liberada hace poco (informativa)
  ('taller', (SELECT id FROM talleres WHERE slug = 'mini-herbario-panel'), 'Helena Cobas', '611000008', 'helena@ejemplo.com', 1, 'liberada', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-2 days'), strftime('%Y-%m-%dT%H:%M:%S', 'now', '-3 days'), 'panel-r8');

-- Clase suelta de mañana sin pagar y sin plazo (urgente) y una mensual del mes en curso (esta semana).
INSERT INTO reservas (tipo, grupo_id, mes, fecha_sesion, nombre, telefono, email, estado, caduca_en, creado_en, codigo) VALUES
  ('clase_suelta', 4, NULL, date('now', '+1 day'), 'Irma Suelta', '622000001', 'irma@ejemplo.com', 'pendiente', NULL, strftime('%Y-%m-%dT%H:%M:%S', 'now', '-2 days'), 'panel-r9'),
  ('clase_mensual', 1, strftime('%Y-%m', 'now'), NULL, 'Julia Alumna', '622000002', 'julia.a@ejemplo.com', 'pendiente', NULL, strftime('%Y-%m-%dT%H:%M:%S', 'now', '-5 days'), 'panel-r10');
-- Alumnas confirmadas este mes (para «Renovar alumnas» desde el día 20).
INSERT INTO reservas (tipo, grupo_id, mes, nombre, telefono, email, estado, creado_en, codigo) VALUES
  ('clase_mensual', 1, strftime('%Y-%m', 'now'), 'Karla Alumna', '622000003', 'karla@ejemplo.com', 'confirmada', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-9 days'), 'panel-r11'),
  ('clase_mensual', 1, strftime('%Y-%m', 'now'), 'Lola Alumna', '622000004', 'lola@ejemplo.com', 'confirmada', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-9 days'), 'panel-r12'),
  ('clase_mensual', 7, strftime('%Y-%m', 'now'), 'Mara Alumna', '622000005', 'mara@ejemplo.com', 'confirmada', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-9 days'), 'panel-r13');

INSERT INTO solicitudes (tipo, nombre, email, telefono, motivo, categoria_id, fecha_aprox, personas, mensaje, estado, creado_en) VALUES
  ('privado', 'Nuria Cumple', 'nuria@ejemplo.com', '633333340', 'Cumpleaños', 2, date('now', '+30 days'), 6, 'Cumpleaños de mi hija.', 'nueva', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-1 day')),
  ('privado', 'Olga Empresa', 'olga@ejemplo.com', NULL, 'Equipo de empresa', 3, date('now', '+10 days'), 12, 'Actividad de equipo.', 'en_curso', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-8 days'));
INSERT INTO solicitudes (tipo, nombre, email, telefono, tipo_bono, detalle, para_quien, estado, creado_en) VALUES
  ('bono', 'Pablo Regalo', 'pablo@ejemplo.com', '633333341', 'taller', 'Taller de velas', 'Mi pareja', 'nueva', strftime('%Y-%m-%dT%H:%M:%S', 'now', '-5 hours'));
