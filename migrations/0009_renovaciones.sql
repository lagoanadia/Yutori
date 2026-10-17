-- Registra que la renovación automática de las alumnas mensuales de un mes ya se hizo (una sola vez por mes destino),
-- aunque varias visitas lleguen a la vez el día 20: solo quien consigue insertar la fila renueva.
CREATE TABLE renovaciones (
  mes TEXT PRIMARY KEY,                -- mes destino, AAAA-MM
  hecha_en TEXT NOT NULL               -- momento UTC AAAA-MM-DDTHH:MM:SS
);
