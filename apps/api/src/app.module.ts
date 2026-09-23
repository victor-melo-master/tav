import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { LedgerModule } from './ledger/ledger.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { CajeroModule } from './cajero/cajero.module';
import { CobradorModule } from './cobrador/cobrador.module';
import { UploadsModule } from './uploads/uploads.module';
import { CajasModule } from './cajas/cajas.module';
import { CorredoresModule } from './corredores/corredores.module';
import { PagadorModule } from './pagador/pagador.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LedgerModule,
    AuthModule,
    AdminModule,
    CajeroModule,
    CobradorModule,
    UploadsModule,
    CajasModule,
    CorredoresModule,
    PagadorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
