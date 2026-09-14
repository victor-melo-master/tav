import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CorredorService } from './corredor.service';

@Module({
  imports: [PrismaModule],
  providers: [CorredorService],
  exports: [CorredorService],
})
export class CorredoresModule {}
