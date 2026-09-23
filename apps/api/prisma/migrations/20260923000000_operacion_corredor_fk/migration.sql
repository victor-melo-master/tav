-- AddForeignKey
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_corredorId_fkey" FOREIGN KEY ("corredorId") REFERENCES "Corredor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

