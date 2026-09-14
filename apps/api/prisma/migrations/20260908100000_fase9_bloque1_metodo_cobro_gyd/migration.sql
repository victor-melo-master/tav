-- Fase 9 Bloque 1: añade efectivo_gyd como método de cobro.
-- El cobrador recorre Guyana cobrando en efectivo guyanés; es el caso más
-- frecuente y no existía. La tasa GYD_GYD = 1 se siembra en el seed.

ALTER TYPE "MetodoCobro" ADD VALUE 'efectivo_gyd' BEFORE 'efectivo_usd';
