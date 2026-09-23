import { Module } from '@nestjs/common';
import { PrecioCajeroService } from './precio-cajero.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PrecioCajeroService],
  exports: [PrecioCajeroService],
})
export class PrecioCajeroModule {}
