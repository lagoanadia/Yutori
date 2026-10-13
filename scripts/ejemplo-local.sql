-- SOLO PARA PROBAR EN LOCAL: datos inventados para ver el panel con contenido.
-- npm run db:ejemplo   (nunca se aplica en internet)

INSERT INTO talleristas (nombre, marca, instagram, email, telefono, categoria_id, propuesta, ha_impartido, autonoma, estado, creado_en) VALUES
  ('Lucía Prueba', 'Slowly Atelier', '@slowly.prueba', 'lucia@ejemplo.com', '600000001', 5, 'Grabado y estampación en tote bags, 2,5 h, unos 45 €', 1, 1, 'aceptada', '2026-09-02T10:00:00'),
  ('Marta Prueba', 'Papel Lento', '@papellento', 'marta@ejemplo.com', '600000002', 6, 'Lámparas de origami, 2 h, unos 40 €', 1, 1, 'aceptada', '2026-09-10T18:30:00'),
  ('Sara Prueba', NULL, '@sara.acuarela', 'sara@ejemplo.com', NULL, 1, 'Taller de acuarela botánica, 3 h', 0, 0, 'reserva', '2026-10-01T09:15:00'),
  ('Elena Prueba', 'Barro Azul', '@barroazul', 'elena@ejemplo.com', '600000004', 7, 'Cerámica en frío para principiantes, 2 h, 35 €', 1, 1, 'nueva', '2026-10-12T21:04:00'),
  ('Nora Prueba', 'Hilo y Aguja', '@hiloyaguja', 'nora@ejemplo.com', NULL, 3, 'Bordado de iniciales en servilletas, 2 h', 1, 0, 'revision', '2026-10-11T12:20:00');

INSERT INTO talleres (tallerista_id, titulo, slug, fecha, franja, hora_inicio, hora_fin, precio_cent, plazas, texto, es_evento, datos_pago, estado, pago_reserva_recibido, codigo_enlace, fecha_limite) VALUES
  (1, 'Grabado y estampación en tote bags', 'grabado-tote-bags', '2026-10-17', 'sabado_manana', '10:30', '13:00', 4500, 8, 'Diseña, graba y estampa tu propia bolsa de tela.', 0, 'Bizum 600000001', 'publicado', 1, 'ejemplo-lucia-1', '2026-10-14'),
  (2, 'Lámparas de origami', 'lamparas-origami', '2026-10-25', 'domingo_tarde', '16:00', '18:00', 4000, 8, 'Diseña y crea tu propia lámpara de papel.', 0, 'Bizum 600000002', 'publicado', 1, 'ejemplo-marta-1', '2026-10-14'),
  (NULL, 'Taller de Halloween', 'taller-halloween', '2026-10-31', 'sabado_manana', '11:00', '13:00', 3000, 8, 'Un taller especial para celebrar Halloween.', 1, 'Bizum de Yutori', 'publicado', 0, NULL, NULL),
  (1, NULL, NULL, '2026-11-08', 'domingo_manana', NULL, NULL, NULL, 8, NULL, 0, NULL, 'hueco', 0, 'ejemplo-lucia-2', '2026-10-14'),
  (2, 'Cuadernos cosidos a mano', 'cuadernos-cosidos', '2026-11-14', 'sabado_tarde', '17:00', '19:00', 3500, 6, 'Encuaderna tu propio cuaderno.', 0, 'Bizum 600000002', 'enviado', 0, 'ejemplo-marta-2', '2026-10-14');

INSERT INTO reservas (tipo, taller_id, nombre, telefono, email, plazas, estado, caduca_en, creado_en) VALUES
  ('taller', 1, 'Ana Cliente', '611111111', 'ana@ejemplo.com', 2, 'confirmada', NULL, '2026-10-05T19:00:00'),
  ('taller', 1, 'Bea Cliente', '611111112', 'bea@ejemplo.com', 1, 'confirmada', NULL, '2026-10-06T11:00:00'),
  ('taller', 1, 'Carla Cliente', '611111113', 'carla@ejemplo.com', 2, 'pendiente', '2026-10-14T19:00:00', '2026-10-13T19:00:00'),
  ('taller', 2, 'Diana Cliente', '611111114', 'diana@ejemplo.com', 8, 'confirmada', NULL, '2026-10-02T10:00:00'),
  ('taller', 3, 'Eva Cliente', '611111115', 'eva@ejemplo.com', 3, 'pendiente', '2026-10-14T12:00:00', '2026-10-13T12:00:00');

INSERT INTO reservas (tipo, grupo_id, mes, fecha_sesion, nombre, telefono, email, modalidad, estado, creado_en) VALUES
  ('clase_mensual', 1, '2026-11', NULL, 'Flor Alumna', '622222221', 'flor@ejemplo.com', NULL, 'confirmada', '2026-10-01T10:00:00'),
  ('clase_mensual', 1, '2026-11', NULL, 'Gala Alumna', '622222222', 'gala@ejemplo.com', NULL, 'pendiente', '2026-10-12T10:00:00'),
  ('clase_mensual', 7, '2026-11', NULL, 'Hana Alumna', '622222223', 'hana@ejemplo.com', 'Con máquina', 'confirmada', '2026-10-03T10:00:00'),
  ('clase_suelta', 4, NULL, '2026-10-20', 'Inés Puntual', '622222224', 'ines@ejemplo.com', NULL, 'pendiente', '2026-10-13T09:00:00');

INSERT INTO solicitudes (tipo, nombre, email, telefono, motivo, categoria_id, fecha_aprox, personas, mensaje, estado, creado_en) VALUES
  ('privado', 'Julia Grupo', 'julia@ejemplo.com', '633333331', 'Despedida', 4, '2026-11-21', 10, 'Despedida de soltera, nos gustaría hacer velas.', 'nueva', '2026-10-12T22:10:00');
INSERT INTO solicitudes (tipo, nombre, email, telefono, tipo_bono, detalle, para_quien, mensaje, estado, creado_en) VALUES
  ('bono', 'Kike Regalo', 'kike@ejemplo.com', '633333332', 'importe', '50 €', 'Mi madre', '¡Feliz cumpleaños!', 'en_curso', '2026-10-10T08:45:00');
