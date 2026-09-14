import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CajaService } from './caja.service';
import { AbrirCajaHttpDto } from './dto/abrir-caja.dto';
import { IngresarCajaMadreHttpDto } from './dto/ingresar-caja-madre.dto';
import { AnularAperturaHttpDto } from './dto/anular-apertura.dto';
import { PaginacionDto } from '../cajero/dto/paginacion.dto';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';

/**
 * Endpoints del módulo de cajas (tesorería). Solo el admin.
 *
 * Expone el CajaService sin reescribir lógica: ingreso a la caja madre,
 * apertura/recarga de cajas de corredor, anular apertura, listar cajas,
 * ver movimientos de una caja, y alertas.
 *
 * anularPago sigue rechazando (ReversoPagoNoDefinidoException) hasta que
 * el cliente decida.
 */
@ApiTags('cajas')
@ApiBearerAuth()
@Roles('admin')
@Controller('cajas')
export class CajasController {
  constructor(private readonly cajas: CajaService) {}

  // ─────────────────────────── LISTAR ───────────────────────────

  @Get()
  @ApiOperation({ summary: 'Lista todas las cajas (madre y de corredor) con su saldo' })
  async listar() {
    return this.cajas.listarCajas();
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Alertas activas de cajas (saldo bajo y saldo negativo)' })
  async alertas() {
    return this.cajas.alertasCaja();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una caja' })
  async obtener(@Param('id') id: string) {
    return this.cajas.obtenerCaja(id);
  }

  @Get(':id/movimientos')
  @ApiOperation({ summary: 'Movimientos de una caja, paginado por seq desc' })
  async movimientos(@Param('id') id: string, @Query() query: PaginacionDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.cajas.movimientosCaja(id, page, limit);
  }

  // ─────────────────────────── INGRESO A CAJA MADRE ───────────────────────────

  @Post('ingreso-madre')
  @ApiOperation({ summary: 'Registra un ingreso de USDT a la caja madre' })
  @ApiResponse({ status: 201, description: 'Ingreso registrado (o devuelto si ya existía por clientUuid)' })
  async ingresarCajaMadre(@Body() dto: IngresarCajaMadreHttpDto, @Req() req: AuthenticatedRequest) {
    const { caja, movimiento, yaExistia } = await this.cajas.ingresarCajaMadre({
      clientUuid: dto.clientUuid,
      cajaMadreId: dto.cajaMadreId,
      montoCents: BigInt(dto.montoCents),
      motivo: dto.motivo,
      registradoPorId: req.user.sub,
    });
    return { caja, movimiento, yaExistia };
  }

  // ─────────────────────────── APERTURA / RECARGA ───────────────────────────

  @Post('abrir')
  @ApiOperation({ summary: 'Abre una caja de corredor convirtiendo USDT desde la caja madre' })
  @ApiResponse({ status: 201, description: 'Apertura registrada (doble entrada)' })
  async abrirCaja(@Body() dto: AbrirCajaHttpDto, @Req() req: AuthenticatedRequest) {
    const res = await this.cajas.abrirCaja({
      clientUuid: dto.clientUuid,
      cajaId: dto.cajaId,
      cajaMadreId: dto.cajaMadreId,
      montoMadreCents: BigInt(dto.montoMadreCents),
      montoDestinoCents: BigInt(dto.montoDestinoCents),
      tasaConversion: dto.tasaConversion,
      registradoPorId: req.user.sub,
    });
    return res;
  }

  @Post('recargar')
  @ApiOperation({ summary: 'Recarga una caja de corredor (igual que abrir, pero la caja ya estaba abierta)' })
  @ApiResponse({ status: 201, description: 'Recarga registrada (doble entrada)' })
  async recargarCaja(@Body() dto: AbrirCajaHttpDto, @Req() req: AuthenticatedRequest) {
    const res = await this.cajas.recargarCaja({
      clientUuid: dto.clientUuid,
      cajaId: dto.cajaId,
      cajaMadreId: dto.cajaMadreId,
      montoMadreCents: BigInt(dto.montoMadreCents),
      montoDestinoCents: BigInt(dto.montoDestinoCents),
      tasaConversion: dto.tasaConversion,
      registradoPorId: req.user.sub,
    });
    return res;
  }

  // ─────────────────────────── ANULAR APERTURA ───────────────────────────

  @Post('anular-apertura')
  @ApiOperation({ summary: 'Anula una apertura/recarga insertando los reversos (doble entrada al revés)' })
  @ApiResponse({ status: 201, description: 'Reversos insertados' })
  async anularApertura(@Body() dto: AnularAperturaHttpDto, @Req() req: AuthenticatedRequest) {
    return this.cajas.anularApertura({
      movimientoCajaId: dto.movimientoCajaId,
      motivo: dto.motivo,
      actorId: req.user.sub,
    });
  }
}
