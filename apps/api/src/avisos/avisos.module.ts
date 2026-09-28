import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AvisosService } from './avisos.service';
import { AvisosController } from './avisos.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AvisosController],
  providers: [AvisosService],
  exports: [AvisosService],
})
export class AvisosModule {}
