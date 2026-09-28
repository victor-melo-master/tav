-- AlterEnum
ALTER TYPE "TipoAviso" ADD VALUE 'sin_conexion';

-- AlterTable
ALTER TABLE "Aviso" ADD COLUMN     "resueltoAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Aviso_cajeroId_resueltoAt_idx" ON "Aviso"("cajeroId", "resueltoAt");
