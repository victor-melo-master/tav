import { Module } from '@nestjs/common';
import { CajeroController } from './cajero.controller';
import { CajeroService } from './cajero.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PrecioCajeroModule } from '../precio-cajero/precio-cajero.module';
import { CajasModule } from '../cajas/cajas.module';

@Module({
  imports: [PrismaModule, LedgerModule, PrecioCajeroModule, CajasModule],
  controllers: [CajeroController],
  providers: [CajeroService],
})
export class CajeroModule {}
