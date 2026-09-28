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
import { AvisosAbonoModule } from './avisos-abono/avisos-abono.module';
import { AvisosModule } from './avisos/avisos.module';
import { AuditModule } from './audit/audit.module';

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
    AvisosAbonoModule,
    AvisosModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
