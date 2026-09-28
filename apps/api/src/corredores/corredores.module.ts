import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CorredorService } from './corredor.service';
import { CorredorController } from './corredor.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CorredorController],
  providers: [CorredorService],
  exports: [CorredorService],
})
export class CorredoresModule {}
