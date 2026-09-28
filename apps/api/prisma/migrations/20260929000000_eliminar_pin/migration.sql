-- Elimina el sistema de PIN: el acceso es solo por correo + contraseña.
-- La sesión persistente se maneja con tokens; no hay PIN local.
ALTER TABLE "Usuario" DROP COLUMN IF EXISTS "pinHash";
ALTER TABLE "Usuario" DROP COLUMN IF EXISTS "pinIntentos";
ALTER TABLE "Usuario" DROP COLUMN IF EXISTS "pinBloqueadoAt";
