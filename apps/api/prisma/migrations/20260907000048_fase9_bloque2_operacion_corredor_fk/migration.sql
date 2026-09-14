-- AddForeignKey (Operacion.corredorId → Corredor.id. No declarada como relation
-- en el schema Prisma, siguiendo el precedente de Corredor.creadoPorId: no se
-- acopla el modelo, pero la integridad referencial sí se exige en la base.)
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_corredorId_fkey" FOREIGN KEY ("corredorId") REFERENCES "Corredor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index para la cola del pagador: operaciones pendientes por corredor.
CREATE INDEX "Operacion_corredorId_estado_idx" ON "Operacion"("corredorId", "estado");
