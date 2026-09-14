-- Fase 9 Bloque 1: el efectivo del cierre se parte en dos monedas físicas.
--
-- El cobrador lleva billetes guyaneses (GYD) y billetes americanos (USD):
-- son dos pilas distintas que el admin cuenta por separado. Antes todo
-- sumaba en un solo `efectivoDeclaradoCents` en GYD, lo que volvía imposible
-- la verificación: el admin recibe dos monedas y no puede comparar contra
-- un total convertido.
--
-- Cambios:
--   efectivoDeclaradoCents   → efectivoGydDeclaradoCents + efectivoUsdDeclaradoCents
--   efectivoRecibidoCents    → efectivoGydRecibidoCents  + efectivoUsdRecibidoCents
--   diferenciaCents          → diferenciaGydCents        + diferenciaUsdCents
--
-- Los nuevos campos de declarado llegan en default(0) para no romper
-- cierres existentes en el seed. El sistema no está en producción, así
-- que un reset/reseed es aceptable (ver docs/04-despliegue.md).

ALTER TABLE "Cierre" ADD COLUMN "efectivoGydDeclaradoCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Cierre" ADD COLUMN "efectivoUsdDeclaradoCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Cierre" ADD COLUMN "efectivoGydRecibidoCents" BIGINT;
ALTER TABLE "Cierre" ADD COLUMN "efectivoUsdRecibidoCents" BIGINT;
ALTER TABLE "Cierre" ADD COLUMN "diferenciaGydCents" BIGINT;
ALTER TABLE "Cierre" ADD COLUMN "diferenciaUsdCents" BIGINT;

-- Migrar datos viejos si existen: el efectivo declarado viejo (en GYD)
-- se reparte: todo a GYD, nada a USD. No es correcto para datos reales,
-- pero el sistema no está en producción y el seed se regenera.
UPDATE "Cierre"
  SET "efectivoGydDeclaradoCents" = "efectivoDeclaradoCents"
  WHERE "efectivoDeclaradoCents" IS NOT NULL;

UPDATE "Cierre"
  SET "efectivoGydRecibidoCents" = "efectivoRecibidoCents"
  WHERE "efectivoRecibidoCents" IS NOT NULL;

UPDATE "Cierre"
  SET "diferenciaGydCents" = "diferenciaCents"
  WHERE "diferenciaCents" IS NOT NULL;

ALTER TABLE "Cierre" DROP COLUMN "efectivoDeclaradoCents";
ALTER TABLE "Cierre" DROP COLUMN "efectivoRecibidoCents";
ALTER TABLE "Cierre" DROP COLUMN "diferenciaCents";
