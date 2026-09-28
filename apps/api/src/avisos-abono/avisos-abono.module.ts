import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AvisosAbonoService } from './avisos-abono.service';
import { AvisosAbonoController } from './avisos-abono.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AvisosAbonoController],
  providers: [AvisosAbonoService],
  exports: [AvisosAbonoService],
})
export class AvisosAbonoModule {}
