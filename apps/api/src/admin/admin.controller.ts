import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ListarCajerosDto } from './dto/listar-cajeros.dto';
import { CambiarLimiteDto } from './dto/cambiar-limite.dto';
import { ResolverAmpliacionDto } from './dto/resolver-ampliacion.dto';
import { VerificarCierreDto } from './dto/verificar-cierre.dto';
import { RegistrarCobroAdminDto } from './dto/registrar-cobro-admin.dto';
import {
  ListarAmpliacionesDto,
  ListarCierresDto,
  PaginacionAdminDto,
} from './dto/listar.dto';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PrecioCajeroService } from '../precio-cajero/precio-cajero.service';
import { FijarPrecioCajeroDto } from '../precio-cajero/dto/fijar-precio.dto';
import { fechaCaracasYmd } from '../ledger/fecha-caracas';

/**
 * Endpoints del rol administrador. Capa fina: adminId sale siempre del JWT
 * (req.user.sub), nunca del cuerpo.
 *
 * La lógica de dinero vive en LedgerService; el semáforo en SemaforoService.
 * Aquí no se recalcula nada: se delega, se filtra y se formatea.
 *
 * El reporte de ganancias NO está implementado aún: requiere el precio de
 * compra del USDT (paso 5) y el precio de venta congelado por operación,
 * que se añaden en los pasos siguientes. Ver docs/07-fase-9-multi-corredor.md.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly precioCajero: PrecioCajeroService,
  ) {}

  // ─────────────────────────── USUARIOS ───────────────────────────

  @Post('usuarios')
  @ApiOperation({ summary: 'Crea un cajero o cobrador (las cuentas las crea el admin)' })
  @ApiResponse({ status: 201, description: 'Usuario creado con su perfil' })
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese teléfono' })
  async crearUsuario(@Body() dto: CrearUsuarioDto, @Req() req: AuthenticatedRequest) {
    // creadoPorId sale del JWT, nunca del body.
    return this.admin.crearUsuario(dto, req.user.sub);
  }

  // ─────────────────────────── CAJEROS ───────────────────────────

  @Get('cajeros')
  @ApiOperation({
    summary: 'Lista todos los cajeros con deuda, límite, semáforo y días sin conectarse',
  })
  @ApiResponse({
    status: 200,
    description: 'Cajeros ordenados por urgencia, con filtros opcionales por semáforo y búsqueda',
  })
  async cajeros(@Query() filtros: ListarCajerosDto) {
    return this.admin.cajeros(filtros);
  }

  @Get('cajeros/:id')
  @ApiOperation({ summary: 'Ficha completa de un cajero con movimientos y operaciones' })
  @ApiResponse({ status: 200, description: 'Perfil, semáforo, movimientos, operaciones y ampliaciones' })
  @ApiResponse({ status: 404, description: 'Cajero no encontrado' })
  async fichaCajero(@Param('id') id: string) {
    return this.admin.fichaCajero(id);
  }

  @Patch('cajeros/:id/limite')
  @ApiOperation({ summary: 'Cambia el límite de crédito de un cajero (queda en AuditLog)' })
  @ApiResponse({ status: 200, description: 'Límite actualizado con auditoría del valor anterior y nuevo' })
  @ApiResponse({ status: 404, description: 'Cajero no encontrado' })
  async cambiarLimite(
    @Param('id') id: string,
    @Body() dto: CambiarLimiteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.admin.cambiarLimite(req.user.sub, id, dto);
  }

  // ─────────────────────────── AMPLIACIONES ───────────────────────────

  @Get('ampliaciones')
  @ApiOperation({ summary: 'Lista ampliaciones filtradas por estado (pendientes primero)' })
  @ApiResponse({ status: 200, description: 'Ampliaciones con su cajero y operación si fue consumida' })
  async ampliaciones(@Query() filtros: ListarAmpliacionesDto) {
    return this.admin.ampliaciones(filtros);
  }

  @Post('ampliaciones/:id/aprobar')
  @ApiOperation({ summary: 'Aprueba una ampliación pendiente con nota opcional' })
  @ApiResponse({ status: 201, description: 'Ampliación aprobada — se consume al usarse en una operación' })
  @ApiResponse({ status: 400, description: 'La ampliación no está pendiente' })
  @ApiResponse({ status: 404, description: 'Ampliación no encontrada' })
  async aprobarAmpliacion(
    @Param('id') id: string,
    @Body() dto: ResolverAmpliacionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.admin.aprobarAmpliacion(req.user.sub, id, dto);
  }

  @Post('ampliaciones/:id/rechazar')
  @ApiOperation({ summary: 'Rechaza una ampliación pendiente con nota opcional' })
  @ApiResponse({ status: 201, description: 'Ampliación rechazada' })
  @ApiResponse({ status: 400, description: 'La ampliación no está pendiente' })
  @ApiResponse({ status: 404, description: 'Ampliación no encontrada' })
  async rechazarAmpliacion(
    @Param('id') id: string,
    @Body() dto: ResolverAmpliacionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.admin.rechazarAmpliacion(req.user.sub, id, dto);
  }

  // ─────────────────────────── CIERRES ───────────────────────────

  @Get('cierres')
  @ApiOperation({ summary: 'Lista cierres filtrados por estado (enviados primero)' })
  @ApiResponse({ status: 200, description: 'Cierres paginados con su cobrador y conteo de cobros' })
  async cierres(@Query() query: ListarCierresDto) {
    return this.admin.cierres(query, query);
  }

  @Get('cierres/:id')
  @ApiOperation({ summary: 'Detalle de un cierre con todos los cobros del día del cobrador' })
  @ApiResponse({ status: 200, description: 'Cierre con cobros no anulados y datos del cobrador' })
  @ApiResponse({ status: 404, description: 'Cierre no encontrado' })
  async cierreDetalle(@Param('id') id: string) {
    return this.admin.cierreDetalle(id);
  }

  @Post('cierres/:id/verificar')
  @ApiOperation({
    summary: 'Verifica un cierre capturando el efectivo recibido; calcula la diferencia',
  })
  @ApiResponse({
    status: 201,
    description: 'Cierre verificado o marcado con_diferencia según el cuadre',
  })
  @ApiResponse({ status: 400, description: 'El cierre no está enviado, o hay diferencia sin nota' })
  @ApiResponse({ status: 404, description: 'Cierre no encontrado' })
  async verificarCierre(
    @Param('id') id: string,
    @Body() dto: VerificarCierreDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.admin.verificarCierre(req.user.sub, id, dto);
  }

  // ──────────────────── PRECIOS POR CAJERO (nuevo modelo) ────────────────────

  @Get('cajeros/:id/precios')
  @ApiOperation({
    summary: 'Precios vigentes del cajero por servicio, con los servicios sin precio marcados',
  })
  @ApiResponse({ status: 200, description: 'Un precio por servicio activo; null donde falta por fijar' })
  @ApiResponse({ status: 404, description: 'Cajero no encontrado' })
  async preciosCajero(@Param('id') id: string) {
    return this.precioCajero.preciosCajero(id);
  }

  @Post('cajeros/:id/precios')
  @ApiOperation({ summary: 'Fija el precio de un servicio para un cajero (queda en el historial)' })
  @ApiResponse({ status: 201, description: 'Precio fijado — inserta una fila nueva en el historial' })
  @ApiResponse({ status: 400, description: 'Precio inválido o servicio desactivado' })
  @ApiResponse({ status: 404, description: 'Cajero o servicio no encontrado' })
  async fijarPrecioCajero(
    @Param('id') id: string,
    @Body() dto: FijarPrecioCajeroDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.precioCajero.fijarPrecio(id, dto.servicioId, dto.precioGyd, req.user.sub);
  }

  @Get('cajeros/:id/precios/historial')
  @ApiOperation({ summary: 'Historial de cambios de precio del cajero, opcionalmente por servicio' })
  @ApiResponse({ status: 200, description: 'Cambios ordenados del más reciente al más viejo' })
  async historialPreciosCajero(
    @Param('id') id: string,
    @Query('servicioId') servicioId?: string,
  ) {
    return this.precioCajero.historial(id, servicioId);
  }

  // ─────────────────────────── COBROS DEL ADMIN ───────────────────────────

  @Post('cobros')
  @ApiOperation({
    summary: 'Registra un pago en nombre de un cajero, sin cobrador (no toca ningún cierre)',
  })
  @ApiResponse({ status: 201, description: 'Cobro registrado (o devuelto si ya existía por clientUuid)' })
  @ApiResponse({ status: 422, description: 'Cobro en BS sin tasa, o cajero/cobrador inválido' })
  async registrarCobro(@Body() dto: RegistrarCobroAdminDto, @Req() req: AuthenticatedRequest) {
    const { cobro, yaExistia } = await this.admin.registrarCobro(req.user.sub, dto);
    return { cobro, yaExistia };
  }

  // ─────────────────────── MOVIMIENTOS DIARIOS ───────────────────────

  @Get('movimientos-diarios')
  @ApiOperation({
    summary: 'Reporte diario de movimientos: operaciones del día con precio de venta, compra y margen',
  })
  @ApiResponse({
    status: 200,
    description: 'Operaciones del día con margen y totales ponderados por monto',
  })
  async movimientosDiarios(@Query('fecha') fecha?: string) {
    return this.admin.movimientosDiarios(fecha ?? fechaCaracasYmd());
  }

  // ─────────────────────────── TABLERO ───────────────────────────

  @Get('resumen')
  @ApiOperation({
    summary: 'Totales del día y del mes: cobrado, operaciones, cartera, semáforo, cierres y ampliaciones',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen del tablero del admin (sin reporte de ganancias — pendiente de decisión del cliente)',
  })
  async resumen() {
    return this.admin.resumen();
  }
}
