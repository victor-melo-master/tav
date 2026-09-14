import { Module } from '@nestjs/common';
import { TasaController } from './tasa.controller';
import { TasaService } from './tasa.service';
import { TasaCorredorService } from './tasa-corredor.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TasaController],
  providers: [TasaService, TasaCorredorService],
  exports: [TasaCorredorService],
})
export class TasaModule {}
