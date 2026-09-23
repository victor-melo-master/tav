/*
  Warnings:

  - You are about to drop the column `corredorId` on the `Caja` table. All the data in the column will be lost.
  - Added the required column `nombre` to the `Caja` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cajaId` to the `Corredor` table without a default value. This is not possible if the table is not empty.
  - Made the column `servicio` on table `Corredor` required. This step will fail if there are existing NULL values in that column.
  - Made the column `servicioNombre` on table `Corredor` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Caja" DROP CONSTRAINT "Caja_corredorId_fkey";

-- DropIndex
DROP INDEX "Caja_corredorId_key";

-- DropCheck: la restricción esMadre_xor_corredorId ya no aplica (la caja no
-- tiene corredorId). La madre se distingue solo por esMadre=true y por no
-- tener servicios que la referencien (validación de CorredorService).
ALTER TABLE "Caja" DROP CONSTRAINT "Caja_esMadre_xor_corredorId";

-- AlterTable
ALTER TABLE "Caja" DROP COLUMN "corredorId",
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "pais" TEXT;

-- AlterTable
ALTER TABLE "Corredor" ADD COLUMN     "cajaId" TEXT NOT NULL,
ALTER COLUMN "servicio" SET NOT NULL,
ALTER COLUMN "servicioNombre" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Corredor_cajaId_idx" ON "Corredor"("cajaId");

-- AddForeignKey
ALTER TABLE "Corredor" ADD CONSTRAINT "Corredor_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único parcial: no puede haber dos servicios ACTIVOS con el mismo
-- (pais, servicio). BCV y tasa especial son servicios distintos, así que
-- coexisten; pero no pueden existir dos "BCV" activos a la vez. El filtro
-- WHERE activo = true permite reactivar uno tras desactivar el duplicado.
CREATE UNIQUE INDEX "Corredor_pais_servicio_activo_key"
  ON "Corredor" ("pais", "servicio")
  WHERE "activo" = true;
