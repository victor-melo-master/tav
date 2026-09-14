-- Fase 9 Bloque 3: tasas por corredor.
--
-- La tasa que ve el cajero se compone de tres números que teclea el admin:
--   pataBase      1 USDT = X GYD   (una sola, mueve todos los corredores)
--   pataDestino   1 USDT = Y mon   (una por corredor)
--   margen        %                (uno por corredor)
--   tasaCotizada  (pataDestino ÷ pataBase) × (1 − margen/100)
--
-- La publicación es atómica: la pata base y todos los items se insertan en
-- una sola transacción. Ver docs/07-fase-9-multi-corredor.md §3.

CREATE TABLE "PublicacionTasas" (
    "id"              TEXT NOT NULL,
    "pataBase"        DECIMAL(18,6) NOT NULL,
    "publicadaPorId"  TEXT NOT NULL,
    "publicadaAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicacionTasas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicacionTasas_publicadaAt_idx" ON "PublicacionTasas"("publicadaAt");

CREATE TABLE "PublicacionTasaItem" (
    "id"              TEXT NOT NULL,
    "publicacionId"   TEXT NOT NULL,
    "corredorId"      TEXT NOT NULL,
    "pataDestino"     DECIMAL(18,6) NOT NULL,
    "margen"          DECIMAL(6,4) NOT NULL,
    "tasaCotizada"    DECIMAL(18,8) NOT NULL,
    CONSTRAINT "PublicacionTasaItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicacionTasaItem_publicacionId_idx" ON "PublicacionTasaItem"("publicacionId");
CREATE INDEX "PublicacionTasaItem_corredorId_idx" ON "PublicacionTasaItem"("corredorId");

ALTER TABLE "PublicacionTasaItem"
  ADD CONSTRAINT "PublicacionTasaItem_publicacionId_fkey"
  FOREIGN KEY ("publicacionId") REFERENCES "PublicacionTasas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicacionTasaItem"
  ADD CONSTRAINT "PublicacionTasaItem_corredorId_fkey"
  FOREIGN KEY ("corredorId") REFERENCES "Corredor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validación: el margen es un porcentaje legible (2.5 = 2.5%).
-- 0 ≤ margen < 100. Un margen negativo es vender a pérdida; uno de 100 o
-- más deja al beneficiario sin recibir nada.
ALTER TABLE "PublicacionTasaItem"
  ADD CONSTRAINT "PublicacionTasaItem_margen_rango_chk"
  CHECK ("margen" >= 0 AND "margen" < 100);

-- Configuración global del sistema, clave-valor. La tabla Config ya existe
-- (init); aquí solo añadimos el umbral de aviso al publicar tasas: si un
-- valor se aparta más de este porcentaje de la publicación anterior, la
-- pantalla del admin pide confirmación. En BD, no quemado.
INSERT INTO "Config" ("clave", "valor") VALUES
  ('tasa_umbral_aviso_pct', '10')
ON CONFLICT ("clave") DO NOTHING;
