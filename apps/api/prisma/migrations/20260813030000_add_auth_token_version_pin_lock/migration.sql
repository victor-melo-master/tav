-- Logout real: tokenVersion invalida todos los tokens emitidos antes del
-- incremento. El JWT lleva la versión; refresh y loginPin la comparan con la BD.
ALTER TABLE "Usuario" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Bloqueo del PIN: 5 fallos consecutivos → pinBloqueadoAt se fija.
-- Login con contraseña resetea ambos.
ALTER TABLE "Usuario" ADD COLUMN "pinIntentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Usuario" ADD COLUMN "pinBloqueadoAt" TIMESTAMP(3);
