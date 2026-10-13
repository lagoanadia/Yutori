-- Cada reserva tiene un código secreto para su página de confirmación (/reserva/<código>).
ALTER TABLE reservas ADD COLUMN codigo TEXT;
CREATE UNIQUE INDEX reservas_codigo ON reservas (codigo);
