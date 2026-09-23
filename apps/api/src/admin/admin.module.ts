import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PrecioCajeroModule } from '../precio-cajero/precio-cajero.module';

@Module({
  imports: [PrismaModule, LedgerModule, PrecioCajeroModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
