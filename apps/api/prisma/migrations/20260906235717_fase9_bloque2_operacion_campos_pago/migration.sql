-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoOperacion" ADD VALUE 'pendiente';
ALTER TYPE "EstadoOperacion" ADD VALUE 'pagada';

-- AlterTable
ALTER TABLE "Operacion" ADD COLUMN     "formaPago" TEXT,
ADD COLUMN     "nombreCliente" TEXT,
ADD COLUMN     "pagadaAt" TIMESTAMP(3),
ADD COLUMN     "pagadaPorId" TEXT,
ADD COLUMN     "tasaEjecucion" DECIMAL(18,6);
