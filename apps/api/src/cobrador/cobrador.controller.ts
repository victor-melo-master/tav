import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { CobradorService } from './cobrador.service';
import { RegistrarCobroDto } from './dto/registrar-cobro.dto';
import { AnularCobroDto } from './dto/anular-cobro.dto';
import {
  EnviarCierreDto,
  PaginacionCierresDto,
  CrearAtencionDto,
  CrearAvisoDto,
} from './dto/enviar-cierre.dto';

/**
 * Endpoints del rol cobrador. Capa fina: cobradorId sale siempre del JWT
 * (req.user.sub), nunca del cuerpo.
 *
 * La lógica de dinero vive en LedgerService; el semáforo en SemaforoService.
 * Aquí no se recalcula nada: se delega y se formatea.
 *
 * Todos los cobradores ven las deudas de todos los cajeros — no hay cartera.
 */
@ApiTags('cobrador')
@ApiBearerAuth()
@Roles('cobrador')
@Controller('cobrador')
export class CobradorController {
  constructor(private readonly cobrador: CobradorService) {}

  // ─────────────────────────── CAJEROS ───────────────────────────

  @Get('cajeros')
  @ApiOperation({ summary: 'Lista todos los cajeros ordenados por urgencia de cobro' })
  @ApiResponse({
    status: 200,
    description: 'Cajeros con deuda, límite, semáforo, días sin conectarse y atención activa',
  })
  async cajeros() {
    return this.cobrador.cajeros();
  }

  // ─────────────────────────── COBROS ───────────────────────────

  @Post('cobros')
  @ApiOperation({ summary: 'Registra un cobro que baja la deuda del cajero' })
  @ApiResponse({ status: 201, description: 'Cobro registrado (o devuelto si ya existía por clientUuid)' })
  @ApiResponse({ status: 409, description: 'Cierre no abierto o conflicto de idempotencia' })
  async registrarCobro(@Req() req: AuthenticatedRequest, @Body() dto: RegistrarCobroDto) {
    const { cobro, yaExistia } = await this.cobrador.registrarCobro(req.user.sub, dto);
    return { cobro, yaExistia };
  }

  @Post('cobros/:id/anular')
  @HttpCode(200)
  @ApiOperation({ summary: 'Anula un cobro con motivo. Nunca borra — inserta reverso.' })
  @ApiResponse({ status: 200, description: 'Cobro anulado con reverso insertado' })
  @ApiResponse({ status: 404, description: 'Cobro no encontrado (o pertenece a otro cobrador)' })
  @ApiResponse({ status: 422, description: 'Motivo vacío o menor de 10 caracteres' })
  async anularCobro(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AnularCobroDto,
  ) {
    return this.cobrador.anularCobro(req.user.sub, id, dto.motivo);
  }

  // ─────────────────────────── CIERRES ───────────────────────────

  @Get('cierre-actual')
  @ApiOperation({ summary: 'El cierre de hoy con totales y lista de cobros' })
  async cierreActual(@Req() req: AuthenticatedRequest) {
    return this.cobrador.cierreActual(req.user.sub);
  }

  @Post('cierres/:id/enviar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cierra el día y manda a verificación del admin' })
  @ApiResponse({ status: 200, description: 'Cierre enviado a verificación' })
  @ApiResponse({ status: 409, description: 'Hay cobros sin sincronizar o el cierre ya no está abierto' })
  async enviarCierre(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: EnviarCierreDto,
  ) {
    return this.cobrador.enviarCierre(req.user.sub, id, dto);
  }

  @Get('cierres')
  @ApiOperation({ summary: 'Historial paginado de cierres del cobrador' })
  async cierres(@Req() req: AuthenticatedRequest, @Query() query: PaginacionCierresDto) {
    return this.cobrador.cierres(req.user.sub, query);
  }

  // ─────────────────────────── ATENCIONES ───────────────────────────

  @Post('atenciones')
  @ApiOperation({ summary: 'Marca "lo estoy atendiendo" sobre un cajero' })
  @ApiResponse({ status: 201, description: 'Atención creada' })
  @ApiResponse({ status: 409, description: 'Otro cobrador ya está atendiendo a este cajero' })
  async marcarAtencion(@Req() req: AuthenticatedRequest, @Body() dto: CrearAtencionDto) {
    return this.cobrador.marcarAtencion(req.user.sub, dto);
  }

  @Delete('atenciones/:cajeroId')
  @ApiOperation({ summary: 'Libera la atención sobre un cajero' })
  async liberarAtencion(@Req() req: AuthenticatedRequest, @Param('cajeroId') cajeroId: string) {
    return this.cobrador.liberarAtencion(req.user.sub, cajeroId);
  }

  // ─────────────────────────── AVISOS ───────────────────────────

  @Post('avisos')
  @ApiOperation({ summary: 'Envía un aviso manual de cobro a un cajero' })
  async enviarAviso(@Req() req: AuthenticatedRequest, @Body() dto: CrearAvisoDto) {
    return this.cobrador.enviarAviso(req.user.sub, dto);
  }
}
