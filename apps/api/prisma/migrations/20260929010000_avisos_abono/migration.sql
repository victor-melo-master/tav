-- CreateEnum
CREATE TYPE "EstadoAvisoAbono" AS ENUM ('enviado', 'atendido', 'cancelado', 'caducado');

-- CreateTable
CREATE TABLE "AvisoAbono" (
    "id" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "montoCents" BIGINT NOT NULL,
    "nota" TEXT,
    "estado" "EstadoAvisoAbono" NOT NULL DEFAULT 'enviado',
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvisoAbono_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvisoAbono_cajeroId_estado_idx" ON "AvisoAbono"("cajeroId", "estado");

-- CreateIndex
CREATE INDEX "AvisoAbono_creadoAt_idx" ON "AvisoAbono"("creadoAt");

-- AddForeignKey
ALTER TABLE "AvisoAbono" ADD CONSTRAINT "AvisoAbono_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;
