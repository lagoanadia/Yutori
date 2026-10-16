-- Categorías de taller tal como las pidió Yutori (octubre 2026), en su orden.
-- Las antiguas se desactivan: dejan de salir en los formularios, pero las talleristas que ya las tienen las conservan.
UPDATE categorias SET activa = 0;

INSERT INTO categorias (nombre) VALUES
  ('Pintura y Dibujo'),
  ('Costura'),
  ('Bordado'),
  ('Ganchillo'),
  ('Velas y Aromas'),
  ('Joyería'),
  ('Naturaleza y Botánica'),
  ('Autocuidado'),
  ('Arcilla y Cerámica'),
  ('Encuadernación')
ON CONFLICT (nombre) DO UPDATE SET activa = 1;

-- Las que tienen equivalente claro pasan a la nueva.
UPDATE talleristas SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Pintura y Dibujo')
  WHERE categoria_id = (SELECT id FROM categorias WHERE nombre = 'Acuarela y pintura');
UPDATE talleristas SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Ganchillo')
  WHERE categoria_id = (SELECT id FROM categorias WHERE nombre = 'Ganchillo y punto');
UPDATE talleristas SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Velas y Aromas')
  WHERE categoria_id = (SELECT id FROM categorias WHERE nombre = 'Velas y aromas');

-- Talleres privados: pueden interesar varios tipos de taller a la vez ("Bordado, Joyería").
ALTER TABLE solicitudes ADD COLUMN tipos_taller TEXT;
