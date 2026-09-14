import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CajasModule } from '../cajas/cajas.module';
import { PagadorService } from './pagador.service';
import { PagadorController } from './pagador.controller';

@Module({
  imports: [PrismaModule, CajasModule],
  controllers: [PagadorController],
  providers: [PagadorService],
})
export class PagadorModule {}
