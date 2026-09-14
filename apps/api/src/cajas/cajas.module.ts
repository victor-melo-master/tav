import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CajaService } from './caja.service';
import { CajasController } from './cajas.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CajasController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajasModule {}
