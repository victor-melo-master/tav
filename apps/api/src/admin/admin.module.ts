import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TasaModule } from '../tasa/tasa.module';

@Module({
  imports: [PrismaModule, LedgerModule, TasaModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
