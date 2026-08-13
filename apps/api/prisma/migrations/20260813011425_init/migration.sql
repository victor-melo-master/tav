-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('cajero', 'cobrador', 'admin');

-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('en_verificacion', 'en_proceso', 'completada', 'observada', 'rechazada', 'anulada');

-- CreateEnum
CREATE TYPE "MetodoCobro" AS ENUM ('efectivo_usd', 'bolivares', 'pago_movil', 'usdt');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('cargo', 'abono', 'reverso_cargo', 'reverso_abono', 'ajuste');

-- CreateEnum
CREATE TYPE "EstadoAmpliacion" AS ENUM ('pendiente', 'aprobada', 'rechazada', 'consumida', 'expirada');

-- CreateEnum
CREATE TYPE "EstadoCierre" AS ENUM ('abierto', 'enviado', 'verificado', 'con_diferencia');

-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('cobro_automatico', 'cobro_manual', 'cerca_del_limite', 'sin_cupo', 'vencido', 'ampliacion_resuelta');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "documento" TEXT,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaVezAt" TIMESTAMP(3),
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorId" TEXT,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilCajero" (
    "usuarioId" TEXT NOT NULL,
    "limiteCents" BIGINT NOT NULL,
    "saldoCents" BIGINT NOT NULL DEFAULT 0,
    "deudaDesde" TIMESTAMP(3),
    "zona" TEXT,
    "direccion" TEXT,
    "notas" TEXT,

    CONSTRAINT "PerfilCajero_pkey" PRIMARY KEY ("usuarioId")
);

-- CreateTable
CREATE TABLE "PerfilCobrador" (
    "usuarioId" TEXT NOT NULL,
    "zona" TEXT,

    CONSTRAINT "PerfilCobrador_pkey" PRIMARY KEY ("usuarioId")
);

-- CreateTable
CREATE TABLE "Tasa" (
    "id" TEXT NOT NULL,
    "par" TEXT NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadaPorId" TEXT NOT NULL,

    CONSTRAINT "Tasa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operacion" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "montoOrigenCents" BIGINT NOT NULL,
    "monedaOrigen" TEXT NOT NULL,
    "tasaAplicada" DECIMAL(18,6) NOT NULL,
    "comisionCents" BIGINT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "montoDestinoCents" BIGINT NOT NULL,
    "monedaDestino" TEXT NOT NULL,
    "beneficiario" JSONB NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'en_verificacion',
    "comprobanteUrl" TEXT,
    "ampliacionId" TEXT,
    "creadaPorId" TEXT NOT NULL,
    "creadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladaAt" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "Operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "cobradorId" TEXT,
    "metodo" "MetodoCobro" NOT NULL,
    "montoCents" BIGINT NOT NULL,
    "moneda" TEXT NOT NULL,
    "tasaAplicada" DECIMAL(18,6),
    "montoUsdCents" BIGINT NOT NULL,
    "esEfectivo" BOOLEAN NOT NULL,
    "cierreId" TEXT,
    "comprobanteUrl" TEXT,
    "nota" TEXT,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sincronizadoAt" TIMESTAMP(3),
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimiento" (
    "id" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "montoUsdCents" BIGINT NOT NULL,
    "saldoDespues" BIGINT NOT NULL,
    "origenTipo" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "motivo" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmpliacionCredito" (
    "id" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "montoCents" BIGINT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoAmpliacion" NOT NULL DEFAULT 'pendiente',
    "solicitadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaAt" TIMESTAMP(3),
    "resueltaPorId" TEXT,
    "notaAdmin" TEXT,

    CONSTRAINT "AmpliacionCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cierre" (
    "id" TEXT NOT NULL,
    "cobradorId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "totalRegistradoCents" BIGINT NOT NULL DEFAULT 0,
    "efectivoDeclaradoCents" BIGINT NOT NULL DEFAULT 0,
    "digitalCents" BIGINT NOT NULL DEFAULT 0,
    "estado" "EstadoCierre" NOT NULL DEFAULT 'abierto',
    "entregadoA" TEXT,
    "notaCobrador" TEXT,
    "enviadoAt" TIMESTAMP(3),
    "verificadoAt" TIMESTAMP(3),
    "verificadoPorId" TEXT,
    "efectivoRecibidoCents" BIGINT,
    "diferenciaCents" BIGINT,
    "notaAdmin" TEXT,

    CONSTRAINT "Cierre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atencion" (
    "id" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "cobradorId" TEXT NOT NULL,
    "iniciadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liberadaAt" TIMESTAMP(3),

    CONSTRAINT "Atencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "tipo" "TipoAviso" NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leidoAt" TIMESTAMP(3),
    "enviadoPorId" TEXT,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_telefono_key" ON "Usuario"("telefono");

-- CreateIndex
CREATE INDEX "Usuario_rol_activo_idx" ON "Usuario"("rol", "activo");

-- CreateIndex
CREATE INDEX "Tasa_par_vigenteDesde_idx" ON "Tasa"("par", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Operacion_folio_key" ON "Operacion"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Operacion_clientUuid_key" ON "Operacion"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Operacion_ampliacionId_key" ON "Operacion"("ampliacionId");

-- CreateIndex
CREATE INDEX "Operacion_cajeroId_creadaAt_idx" ON "Operacion"("cajeroId", "creadaAt");

-- CreateIndex
CREATE INDEX "Operacion_estado_idx" ON "Operacion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_folio_key" ON "Cobro"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_clientUuid_key" ON "Cobro"("clientUuid");

-- CreateIndex
CREATE INDEX "Cobro_cobradorId_creadoAt_idx" ON "Cobro"("cobradorId", "creadoAt");

-- CreateIndex
CREATE INDEX "Cobro_cajeroId_creadoAt_idx" ON "Cobro"("cajeroId", "creadoAt");

-- CreateIndex
CREATE INDEX "Cobro_cierreId_idx" ON "Cobro"("cierreId");

-- CreateIndex
CREATE INDEX "Movimiento_cajeroId_creadoAt_idx" ON "Movimiento"("cajeroId", "creadoAt");

-- CreateIndex
CREATE INDEX "Movimiento_origenTipo_origenId_idx" ON "Movimiento"("origenTipo", "origenId");

-- CreateIndex
CREATE INDEX "AmpliacionCredito_cajeroId_estado_idx" ON "AmpliacionCredito"("cajeroId", "estado");

-- CreateIndex
CREATE INDEX "AmpliacionCredito_estado_idx" ON "AmpliacionCredito"("estado");

-- CreateIndex
CREATE INDEX "Cierre_estado_idx" ON "Cierre"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Cierre_cobradorId_fecha_key" ON "Cierre"("cobradorId", "fecha");

-- CreateIndex
CREATE INDEX "Atencion_cajeroId_liberadaAt_idx" ON "Atencion"("cajeroId", "liberadaAt");

-- CreateIndex
CREATE INDEX "Aviso_cajeroId_leidoAt_idx" ON "Aviso"("cajeroId", "leidoAt");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_creadoAt_idx" ON "AuditLog"("actorId", "creadoAt");

-- AddForeignKey
ALTER TABLE "PerfilCajero" ADD CONSTRAINT "PerfilCajero_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilCobrador" ADD CONSTRAINT "PerfilCobrador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_ampliacionId_fkey" FOREIGN KEY ("ampliacionId") REFERENCES "AmpliacionCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cobradorId_fkey" FOREIGN KEY ("cobradorId") REFERENCES "PerfilCobrador"("usuarioId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "Cierre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmpliacionCredito" ADD CONSTRAINT "AmpliacionCredito_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cierre" ADD CONSTRAINT "Cierre_cobradorId_fkey" FOREIGN KEY ("cobradorId") REFERENCES "PerfilCobrador"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_cobradorId_fkey" FOREIGN KEY ("cobradorId") REFERENCES "PerfilCobrador"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "PerfilCajero"("usuarioId") ON DELETE RESTRICT ON UPDATE CASCADE;
