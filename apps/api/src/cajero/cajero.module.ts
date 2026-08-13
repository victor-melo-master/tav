import { Module } from '@nestjs/common';
import { CajeroController } from './cajero.controller';
import { CajeroService } from './cajero.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [CajeroController],
  providers: [CajeroService],
})
export class CajeroModule {}
