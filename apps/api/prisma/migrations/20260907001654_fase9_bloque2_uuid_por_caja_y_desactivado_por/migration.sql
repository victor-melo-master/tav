-- La idempotencia pasa a ser POR CAJA: las dos patas de una apertura (destino
-- y madre) comparten el mismo clientUuid, cada una en su caja. El vínculo
-- entre ellas sigue siendo origenId.
DROP INDEX "MovimientoCaja_clientUuid_key";

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_cajaId_clientUuid_key" ON "MovimientoCaja"("cajaId", "clientUuid");

-- AlterTable: auditoría de quién desactivó el corredor.
ALTER TABLE "Corredor" ADD COLUMN "desactivadoPorId" TEXT;

-- AddForeignKey (Corredor.desactivadoPorId → Usuario.id. No declarada como
-- relation en el schema Prisma, siguiendo el precedente de creadoPorId: la
-- integridad referencial se exige en la base sin acoplar los modelos.)
ALTER TABLE "Corredor" ADD CONSTRAINT "Corredor_desactivadoPorId_fkey" FOREIGN KEY ("desactivadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
