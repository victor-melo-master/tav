-- Folios generados por secuencias de Postgres, nunca contando filas.
-- El seed de desarrollo usa folios TAV-24xx y COB-4xx; las secuencias
-- arrancan más arriba para no chocar con ellos.
CREATE SEQUENCE IF NOT EXISTS "folio_operacion_seq" START 3000;
CREATE SEQUENCE IF NOT EXISTS "folio_cobro_seq" START 1000;
