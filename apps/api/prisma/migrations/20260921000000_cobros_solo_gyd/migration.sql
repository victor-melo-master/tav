-- AlterEnum
CREATE TYPE "MetodoCobro_new" AS ENUM ('efectivo_gyd', 'transferencia_gyd');
-- El USING mapea los valores viejos a los nuevos:
-- efectivo_usd y bolivares son efectivo físico → efectivo_gyd.
-- pago_movil y usdt son transferencia/digital → transferencia_gyd.
ALTER TABLE "Cobro" ALTER COLUMN "metodo" TYPE "MetodoCobro_new"
  USING (CASE "metodo"::text
    WHEN 'efectivo_usd' THEN 'efectivo_gyd'
    WHEN 'bolivares' THEN 'efectivo_gyd'
    WHEN 'pago_movil' THEN 'transferencia_gyd'
    WHEN 'usdt' THEN 'transferencia_gyd'
    ELSE "metodo"::text
  END::"MetodoCobro_new");
ALTER TYPE "MetodoCobro" RENAME TO "MetodoCobro_old";
ALTER TYPE "MetodoCobro_new" RENAME TO "MetodoCobro";
DROP TYPE "public"."MetodoCobro_old";

-- AlterTable
ALTER TABLE "Cierre" DROP COLUMN "diferenciaGydCents",
DROP COLUMN "diferenciaUsdCents",
DROP COLUMN "efectivoGydDeclaradoCents",
DROP COLUMN "efectivoGydRecibidoCents",
DROP COLUMN "efectivoUsdDeclaradoCents",
DROP COLUMN "efectivoUsdRecibidoCents",
ADD COLUMN     "diferenciaCents" BIGINT,
ADD COLUMN     "efectivoDeclaradoCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "efectivoRecibidoCents" BIGINT;

-- AlterTable
ALTER TABLE "Cobro" DROP COLUMN "moneda",
DROP COLUMN "montoBaseCents",
DROP COLUMN "tasaAplicada";
