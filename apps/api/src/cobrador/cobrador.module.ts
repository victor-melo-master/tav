import { Module } from '@nestjs/common';
import { CobradorController } from './cobrador.controller';
import { CobradorService } from './cobrador.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AvisosAbonoModule } from '../avisos-abono/avisos-abono.module';

@Module({
  imports: [PrismaModule, LedgerModule, AvisosAbonoModule],
  controllers: [CobradorController],
  providers: [CobradorService],
})
export class CobradorModule {}
