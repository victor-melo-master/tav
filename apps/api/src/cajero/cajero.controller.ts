import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CajeroService } from './cajero.service';
import { CrearOperacionDto } from './dto/crear-operacion.dto';
import { SolicitarAmpliacionDto } from './dto/solicitar-ampliacion.dto';
import { PaginacionOperacionesDto, PaginacionDto } from './dto/paginacion.dto';
import { Roles } from '../auth/roles.decorator';

/**
 * Endpoints del rol cajero. Capa fina: cajeroId y creadaPorId salen siempre
 * del JWT (req.user.sub), nunca del cuerpo. Un cajero solo opera sobre sí mismo.
 *
 * La lógica de dinero vive en LedgerService; el semáforo en SemaforoService.
 * Aquí no se recalcula nada: se delega y se formatea.
 */
@ApiTags('cajero')
@ApiBearerAuth()
@Roles('cajero')
@Controller('cajero')
export class CajeroController {
  constructor(private readonly cajero: CajeroService) {}

  // ─────────────────────────── RESUMEN ───────────────────────────

  @Get('resumen')
  @ApiOperation({ summary: 'Saldo, límite, disponible y semáforo del cajero' })
  @ApiResponse({ status: 200, description: 'Resumen financiero del cajero autenticado' })
  async resumen(@Req() req: AuthenticatedRequest) {
    return this.cajero.resumen(req.user.sub);
  }

  // ─────────────────────────── CORREDORES ───────────────────────────

  @Get('corredores')
  @ApiOperation({ summary: 'Servicios activos con precio fijado para este cajero (para escoger al operar)' })
  async corredores(@Req() req: AuthenticatedRequest) {
    return this.cajero.corredores(req.user.sub);
  }

  // ─────────────────────────── OPERACIONES ───────────────────────────

  @Get('operaciones')
  @ApiOperation({ summary: 'Lista paginada de operaciones del cajero con filtro por estado' })
  async operaciones(@Req() req: AuthenticatedRequest, @Query() query: PaginacionOperacionesDto) {
    return this.cajero.operaciones(req.user.sub, query);
  }

  @Post('operaciones')
  @ApiOperation({ summary: 'Registra una operación que consume cupo' })
  @ApiResponse({
    status: 409,
    description: 'Sin cupo — devuelve {disponible, requerido, faltante} para que la app muestre cuánto falta',
  })
  async crearOperacion(@Req() req: AuthenticatedRequest, @Body() dto: CrearOperacionDto) {
    // cajeroId y creadaPorId salen del JWT. El cajero solo puede operar sobre sí mismo.
    const { operacion, yaExistia } = await this.cajero.crearOperacion(req.user.sub, req.user.sub, dto);
    return { operacion, yaExistia };
  }

  // ─────────────────────────── MOVIMIENTOS ───────────────────────────

  @Get('movimientos')
  @ApiOperation({ summary: 'Estado de cuenta paginado, ordenado por seq' })
  async movimientos(@Req() req: AuthenticatedRequest, @Query() query: PaginacionDto) {
    return this.cajero.movimientos(req.user.sub, query);
  }

  // ─────────────────────────── AMPLIACIONES ───────────────────────────

  @Post('ampliaciones')
  @ApiOperation({ summary: 'Solicita una ampliación de cupo con monto y motivo' })
  async solicitarAmpliacion(@Req() req: AuthenticatedRequest, @Body() dto: SolicitarAmpliacionDto) {
    return this.cajero.solicitarAmpliacion(req.user.sub, dto);
  }

  @Get('ampliaciones')
  @ApiOperation({ summary: 'Estado de las solicitudes de ampliación del cajero' })
  async ampliaciones(@Req() req: AuthenticatedRequest) {
    return this.cajero.ampliaciones(req.user.sub);
  }
}
