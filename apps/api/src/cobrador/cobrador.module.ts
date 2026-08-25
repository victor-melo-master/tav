import { Module } from '@nestjs/common';
import { CobradorController } from './cobrador.controller';
import { CobradorService } from './cobrador.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [CobradorController],
  providers: [CobradorService],
})
export class CobradorModule {}
