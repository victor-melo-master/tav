-- AlterTable
ALTER TABLE "Movimiento" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "Movimiento_cajeroId_seq_idx" ON "Movimiento"("cajeroId", "seq");
