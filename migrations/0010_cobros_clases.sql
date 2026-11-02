-- Pagos con tarjeta (Stripe) y calendario de las clases mensuales (reunión con Iris del 22/10/2026):
-- baja hasta el día 25, renovación el 26 y cobro el día 1. Al renovar se puede pagar con tarjeta o en efectivo.
ALTER TABLE reservas ADD COLUMN metodo_pago TEXT CHECK (metodo_pago IN ('tarjeta', 'efectivo'));
ALTER TABLE reservas ADD COLUMN importe_cent INTEGER;                      -- lo que se cobra por esta reserva
ALTER TABLE reservas ADD COLUMN stripe_cliente TEXT;                       -- cliente de Stripe (cus_…), para cobrar la renovación
ALTER TABLE reservas ADD COLUMN stripe_metodo TEXT;                        -- tarjeta guardada (pm_…)
ALTER TABLE reservas ADD COLUMN tarjeta TEXT;                              -- «visa ···· 4242», para enseñarla
ALTER TABLE reservas ADD COLUMN stripe_sesion TEXT;                        -- último pago abierto en Stripe (cs_…)
ALTER TABLE reservas ADD COLUMN stripe_pago TEXT;                          -- pago hecho (pi_…)
ALTER TABLE reservas ADD COLUMN pagada_en TEXT;                            -- momento UTC del pago con tarjeta
ALTER TABLE reservas ADD COLUMN no_renueva INTEGER NOT NULL DEFAULT 0;     -- 1 = ha avisado de que no sigue el mes siguiente
ALTER TABLE reservas ADD COLUMN primera_vez INTEGER;                       -- 1 = viene por primera vez (kit de iniciación)
ALTER TABLE reservas ADD COLUMN renovada_de INTEGER REFERENCES reservas(id); -- reserva del mes anterior de la que sale
ALTER TABLE reservas ADD COLUMN cobro_intentado_en TEXT;                   -- el cobro automático ya se lanzó (UTC, con milisegundos)
ALTER TABLE reservas ADD COLUMN cobro_error TEXT;                          -- por qué falló el cobro automático
CREATE INDEX reservas_stripe_sesion ON reservas (stripe_sesion);

-- Presentación de la profesora de cada clase, para la web.
ALTER TABLE clases ADD COLUMN profe_nombre TEXT;
ALTER TABLE clases ADD COLUMN profe_texto TEXT;
ALTER TABLE clases ADD COLUMN profe_foto TEXT;                             -- ruta en R2, como las fotos de los talleres
