import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CorredorService } from './corredor.service';
import { CrearCorredorHttpDto, EditarCorredorHttpDto } from './dto/corredor.dto';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';

/**
 * Endpoints de administración de servicios (corredores). Solo el admin.
 *
 * Expone CorredorService sin reescribir lógica: listar activos e inactivos,
 * crear, editar, activar y desactivar.
 */
@ApiTags('corredores')
@ApiBearerAuth()
@Roles('admin')
@Controller('corredores')
export class CorredorController {
  constructor(private readonly corredores: CorredorService) {}

  // ─────────────────────────── LISTAR ───────────────────────────

  @Get()
  @ApiOperation({ summary: 'Lista todos los servicios, activos e inactivos' })
  async listar() {
    return this.corredores.listar();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un servicio' })
  async obtener(@Param('id') id: string) {
    return this.corredores.obtener(id);
  }

  // ─────────────────────────── ESCRITURA ───────────────────────────

  @Post()
  @ApiOperation({ summary: 'Crea un nuevo servicio' })
  @ApiResponse({ status: 201, description: 'Servicio creado' })
  @ApiResponse({ status: 400, description: 'Validación de caja o duplicado' })
  async crear(@Body() dto: CrearCorredorHttpDto, @Req() req: AuthenticatedRequest) {
    return this.corredores.crear({ ...dto, creadoPorId: req.user.sub });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un servicio' })
  @ApiResponse({ status: 200, description: 'Servicio actualizado' })
  @ApiResponse({ status: 400, description: 'Validación de caja o duplicado' })
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarCorredorHttpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.corredores.editar(id, dto, req.user.sub);
  }

  @Post(':id/activar')
  @ApiOperation({ summary: 'Reactiva un servicio desactivado' })
  @ApiResponse({ status: 201, description: 'Servicio activado' })
  async activar(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.corredores.activar(id, req.user.sub);
  }

  @Post(':id/desactivar')
  @ApiOperation({ summary: 'Desactiva un servicio (no borra, conserva historia)' })
  @ApiResponse({ status: 201, description: 'Servicio desactivado' })
  async desactivar(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.corredores.desactivar(id, req.user.sub);
  }
}
