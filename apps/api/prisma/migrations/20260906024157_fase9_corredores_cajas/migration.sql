-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('apertura', 'recarga', 'ingreso', 'pago', 'reverso_apertura', 'reverso_pago', 'ajuste');

-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'pagador';

-- CreateTable
CREATE TABLE "PerfilPagador" (
    "usuarioId" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "notas" TEXT,

    CONSTRAINT "PerfilPagador_pkey" PRIMARY KEY ("usuarioId")
);

-- CreateTable
CREATE TABLE "Corredor" (
    "id" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "paisNombre" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "monedaNombre" TEXT NOT NULL,
    "formaEntrega" TEXT NOT NULL,
    "formaEntregaNombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorId" TEXT NOT NULL,
    "desactivadoAt" TIMESTAMP(3),

    CONSTRAINT "Corredor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" TEXT NOT NULL,
    "corredorId" TEXT,
    "esMadre" BOOLEAN NOT NULL DEFAULT false,
    "moneda" TEXT NOT NULL,
    "saldoCents" BIGINT NOT NULL DEFAULT 0,
    "umbralAlertaCents" BIGINT,
    "creadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "cajaId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "montoCents" BIGINT NOT NULL,
    "saldoDespues" BIGINT NOT NULL,
    "cajaMadreId" TEXT,
    "montoMadreCents" BIGINT,
    "tasaConversion" DECIMAL(18,6),
    "origenTipo" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "motivo" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerfilPagador_pais_idx" ON "PerfilPagador"("pais");

-- CreateIndex
CREATE INDEX "Corredor_pais_activo_idx" ON "Corredor"("pais", "activo");

-- CreateIndex
CREATE INDEX "Corredor_activo_idx" ON "Corredor"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "Caja_corredorId_key" ON "Caja"("corredorId");

-- CreateIndex
CREATE INDEX "Caja_esMadre_idx" ON "Caja"("esMadre");

-- CreateIndex
CREATE INDEX "Caja_moneda_idx" ON "Caja"("moneda");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_clientUuid_key" ON "MovimientoCaja"("clientUuid");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cajaId_seq_idx" ON "MovimientoCaja"("cajaId", "seq");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cajaId_creadoAt_idx" ON "MovimientoCaja"("cajaId", "creadoAt");

-- CreateIndex
CREATE INDEX "MovimientoCaja_origenTipo_origenId_idx" ON "MovimientoCaja"("origenTipo", "origenId");

-- AddForeignKey
ALTER TABLE "PerfilPagador" ADD CONSTRAINT "PerfilPagador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_corredorId_fkey" FOREIGN KEY ("corredorId") REFERENCES "Corredor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (no declarada como relation en el schema Prisma: cajaMadreId es
-- un String opcional que apunta a Caja.id para soportar doble entrada. La FK
-- garantiza integridad referencial.)
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaMadreId_fkey" FOREIGN KEY ("cajaMadreId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Corredor.creadoPorId → Usuario.id. No declarada como relation
-- en el schema para no acoplar el modelo de corredores al de usuarios; pero la
-- integridad referencial sí se exige en la base.)
ALTER TABLE "Corredor" ADD CONSTRAINT "Corredor_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: una caja es de corredor O madre, nunca ambas ni ninguna.
-- esMadre=true ⟺ corredorId IS NULL. Sin esto, una caja madre con corredorId
-- o una caja de corredor sin corredorId corrompería el modelo de tesorería.
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_esMadre_xor_corredorId" CHECK (
  ("esMadre" = true AND "corredorId" IS NULL)
  OR
  ("esMadre" = false AND "corredorId" IS NOT NULL)
);
