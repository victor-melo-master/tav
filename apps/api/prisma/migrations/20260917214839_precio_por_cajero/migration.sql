/*
  Warnings:

  - You are about to drop the `PublicacionTasaItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PublicacionTasas` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Corredor" DROP CONSTRAINT "Corredor_desactivadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "Operacion" DROP CONSTRAINT "Operacion_corredorId_fkey";

-- DropForeignKey
ALTER TABLE "PublicacionTasaItem" DROP CONSTRAINT "PublicacionTasaItem_corredorId_fkey";

-- DropForeignKey
ALTER TABLE "PublicacionTasaItem" DROP CONSTRAINT "PublicacionTasaItem_publicacionId_fkey";

-- DropIndex
DROP INDEX "Operacion_corredorId_estado_idx";

-- AlterTable
ALTER TABLE "Corredor" ADD COLUMN     "servicio" TEXT,
ADD COLUMN     "servicioNombre" TEXT;

-- DropTable
DROP TABLE "PublicacionTasaItem";

-- DropTable
DROP TABLE "PublicacionTasas";

-- CreateTable
CREATE TABLE "PrecioCajeroServicio" (
    "id" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "precioGyd" DECIMAL(18,6) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fijadoPorId" TEXT NOT NULL,

    CONSTRAINT "PrecioCajeroServicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrecioCajeroServicio_cajeroId_servicioId_vigenteDesde_idx" ON "PrecioCajeroServicio"("cajeroId", "servicioId", "vigenteDesde");

-- CreateIndex
CREATE INDEX "PrecioCajeroServicio_servicioId_idx" ON "PrecioCajeroServicio"("servicioId");

-- CreateIndex
CREATE UNIQUE INDEX "PrecioCajeroServicio_cajeroId_servicioId_vigenteDesde_key" ON "PrecioCajeroServicio"("cajeroId", "servicioId", "vigenteDesde");

-- AddForeignKey
ALTER TABLE "PrecioCajeroServicio" ADD CONSTRAINT "PrecioCajeroServicio_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioCajeroServicio" ADD CONSTRAINT "PrecioCajeroServicio_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Corredor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
