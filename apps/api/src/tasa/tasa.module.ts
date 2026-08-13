import { Module } from '@nestjs/common';
import { TasaController } from './tasa.controller';
import { TasaService } from './tasa.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TasaController],
  providers: [TasaService],
})
export class TasaModule {}
