-- AlterEnum
ALTER TYPE "TipoMovimientoCaja" ADD VALUE 'transferencia';

-- DropForeignKey
ALTER TABLE "Corredor" DROP CONSTRAINT "Corredor_creadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "MovimientoCaja" DROP CONSTRAINT "MovimientoCaja_cajaMadreId_fkey";
