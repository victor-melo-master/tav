import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerService } from './ledger.service';
import { SemaforoService } from './semaforo.service';

@Module({
  imports: [PrismaModule],
  providers: [LedgerService, SemaforoService],
  exports: [LedgerService, SemaforoService],
})
export class LedgerModule {}
