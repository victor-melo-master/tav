-- Fase 9 Bloque 1: la moneda del libro de deuda pasa a GYD.
-- Renombrado de campos: montoUsdCents → montoCents (Movimiento) y
-- montoUsdCents → montoBaseCents (Cobro). No se nombran con la moneda
-- porque el libro tiene una sola moneda por diseño y el nombre mentiría
-- el día que cambie. La moneda base actual es GYD; se documenta en el
-- schema y en AGENTS.md, no en los identificadores.
--
-- No se convierten los valores existentes aquí: el seed se regenera
-- desde cero con montos en GYD. Esta migración es solo renombrado de
-- columnas.

ALTER TABLE "Movimiento" RENAME COLUMN "montoUsdCents" TO "montoCents";
ALTER TABLE "Cobro" RENAME COLUMN "montoUsdCents" TO "montoBaseCents";
