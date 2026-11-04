-- Bonos regalo comprados en la web (pago con tarjeta): importe, código del bono, caducidad y canje.
ALTER TABLE solicitudes ADD COLUMN importe_cent INTEGER;   -- lo que se paga por el bono
ALTER TABLE solicitudes ADD COLUMN codigo_bono TEXT;       -- código que se regala (BONO-XXXX-XXXX)
ALTER TABLE solicitudes ADD COLUMN stripe_sesion TEXT;     -- pago abierto en Stripe (cs_…)
ALTER TABLE solicitudes ADD COLUMN stripe_pago TEXT;       -- pago hecho (pi_…)
ALTER TABLE solicitudes ADD COLUMN pagada_en TEXT;         -- momento UTC del pago
ALTER TABLE solicitudes ADD COLUMN caduca_bono TEXT;       -- último día para usarlo (AAAA-MM-DD): 3 meses desde el pago
ALTER TABLE solicitudes ADD COLUMN canjeado_en TEXT;       -- cuándo se usó
CREATE UNIQUE INDEX solicitudes_codigo_bono ON solicitudes (codigo_bono);
