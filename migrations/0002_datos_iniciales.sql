-- Datos reales de partida: categorías, clases y horarios (precios pendientes de Iris).

INSERT INTO categorias (nombre) VALUES
  ('Acuarela y pintura'),
  ('Ganchillo y punto'),
  ('Costura y bordado'),
  ('Velas y aromas'),
  ('Grabado y estampación'),
  ('Papel y origami'),
  ('Otra');

INSERT INTO clases (id, slug, nombre, tipo, modalidades) VALUES
  (1, 'ganchillo', 'Punto por punto', 'Club de ganchillo', '[]'),
  (2, 'acuarela', 'Aguadas', 'Clases de acuarela', '[]'),
  (3, 'costura', 'Atelier textil', 'Costura y bordado', '["Con máquina","Sin máquina"]');

INSERT INTO grupos (clase_id, dia_semana, hora_inicio, hora_fin) VALUES
  (1, 1, '18:00', '19:30'),
  (1, 1, '19:30', '21:00'),
  (1, 5, '10:30', '12:00'),
  (2, 2, '18:00', '19:30'),
  (2, 2, '19:30', '21:00'),
  (3, 3, '10:00', '12:00'),
  (3, 4, '18:00', '20:00'),
  (3, 4, '20:00', '22:00');
