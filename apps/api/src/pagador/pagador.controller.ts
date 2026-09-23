import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PagadorService } from './pagador.service';
import { EjecutarPagoHttpDto } from './dto/ejecutar-pago.dto';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';

/**
 * Endpoints del rol pagador. Solo pagador.
 *
 * El pagador ve su cola de operaciones pendientes (por país), ejecuta
 * pagos, y revisa lo que ya ejecutó hoy. No ve deuda, margen ni saldos
 * de caja — eso es del admin.
 */
@ApiTags('pagador')
@ApiBearerAuth()
@Roles('pagador')
@Controller('pagador')
export class PagadorController {
  constructor(private readonly pagador: PagadorService) {}

  @Get('cola')
  @ApiOperation({ summary: 'Cola de pagos pendientes del país del pagador' })
  async cola(@Req() req: AuthenticatedRequest) {
    return this.pagador.cola(req.user.sub);
  }

  @Post('pagar')
  @ApiOperation({ summary: 'Ejecuta un pago: descuenta la caja y marca la operación como pagada' })
  async pagar(@Body() dto: EjecutarPagoHttpDto, @Req() req: AuthenticatedRequest) {
    return this.pagador.ejecutarPago(req.user.sub, {
      clientUuid: dto.clientUuid,
      operacionId: dto.operacionId,
      montoCents: BigInt(dto.montoCents),
      montoDestinoCents: BigInt(dto.montoDestinoCents),
      tasaEjecucion: dto.tasaEjecucion,
      formaPago: dto.formaPago,
      nombreCliente: dto.nombreCliente,
      comprobantePagoUrl: dto.comprobantePagoUrl,
    });
  }

  @Get('pagos-del-dia')
  @ApiOperation({ summary: 'Pagos que el pagador ejecutó hoy' })
  async pagosDelDia(@Req() req: AuthenticatedRequest) {
    return this.pagador.pagosDelDia(req.user.sub);
  }
}
