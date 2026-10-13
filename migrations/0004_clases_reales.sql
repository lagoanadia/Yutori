-- Datos reales del curso 2026/27 (publicaciones de Instagram de Yutori, 10/08/2026).

ALTER TABLE clases ADD COLUMN colabora TEXT;
ALTER TABLE clases ADD COLUMN temas TEXT NOT NULL DEFAULT '[]';
ALTER TABLE clases ADD COLUMN kit_incluido INTEGER NOT NULL DEFAULT 0;

ALTER TABLE grupos ADD COLUMN publico TEXT NOT NULL DEFAULT 'adultos' CHECK (publico IN ('adultos', 'ninos'));
ALTER TABLE grupos ADD COLUMN precio_mes_cent INTEGER;
ALTER TABLE grupos ADD COLUMN precio_mes_max_cent INTEGER;   -- costura adultos: 50-60 € según modalidad

ALTER TABLE reservas ADD COLUMN nombre_menor TEXT;           -- clases infantiles: reserva hecha por madre, padre o tutor

UPDATE clases SET
  texto = 'Un curso pensado para empezar desde cero o seguir avanzando poco a poco, mientras das forma a proyectos hechos por ti.',
  temas = '["Puntos básicos","Nuevas técnicas","Lectura de patrones","Proyectos paso a paso"]',
  kit_incluido = 1, precio_suelta_cent = 2000
WHERE slug = 'ganchillo';

UPDATE clases SET
  texto = 'Conoce técnicas de acuarela a través de la práctica y la experimentación en tu propio proyecto. Un punto de encuentro semanal.',
  temas = '["Técnicas de acuarela","Experimentación","Tu propio proyecto"]',
  colabora = 'Yutori x ALO', precio_suelta_cent = 2000
WHERE slug = 'acuarela';

UPDATE clases SET
  texto = 'Un espacio reducido para desarrollar tus proyectos textiles con acompañamiento cercano y sin prisas.',
  temas = '["Costura","Bordado","Pintura textil","Intervención de prendas"]',
  kit_incluido = 1, precio_suelta_cent = 2000
WHERE slug = 'costura';

UPDATE grupos SET precio_mes_cent = 5500 WHERE clase_id IN (SELECT id FROM clases WHERE slug IN ('ganchillo', 'acuarela'));
UPDATE grupos SET precio_mes_cent = 5000, precio_mes_max_cent = 6000 WHERE clase_id = (SELECT id FROM clases WHERE slug = 'costura');

INSERT INTO grupos (clase_id, dia_semana, hora_inicio, hora_fin, publico, precio_mes_cent) VALUES
  ((SELECT id FROM clases WHERE slug = 'ganchillo'), 1, '17:00', '18:00', 'ninos', 4000),
  ((SELECT id FROM clases WHERE slug = 'acuarela'), 2, '17:00', '18:00', 'ninos', 4000),
  ((SELECT id FROM clases WHERE slug = 'costura'), 4, '16:30', '18:00', 'ninos', 4500);
