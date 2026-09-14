-- Backfill de emails para usuarios existentes antes de aplicar restricciones.
ALTER TABLE "Usuario" ADD COLUMN "email" TEXT;

UPDATE "Usuario" SET "email" = lower(replace("telefono", '+', '')) || '@tav.test';

ALTER TABLE "Usuario" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

DROP INDEX IF EXISTS "Usuario_telefono_key";

ALTER TABLE "Usuario" ALTER COLUMN "telefono" DROP NOT NULL;
