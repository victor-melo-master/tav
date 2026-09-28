import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AvisosAbonoService } from './avisos-abono.service';
import { CrearAvisoAbonoDto } from './dto/avisos-abono.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Avisos de abono')
@Controller('cajero/avisos-abono')
export class AvisosAbonoController {
  constructor(private readonly service: AvisosAbonoService) {}

  @Post()
  @Roles('cajero')
  @ApiOperation({ summary: 'Crea un aviso de abono (no es un pago)' })
  @ApiResponse({ status: 201, description: 'Aviso creado' })
  async crear(@Req() req: AuthenticatedRequest, @Body() dto: CrearAvisoAbonoDto) {
    return this.service.crear(req.user.sub, dto);
  }

  @Get()
  @Roles('cajero')
  @ApiOperation({ summary: 'Lista los avisos de abono del cajero' })
  async listar(@Req() req: AuthenticatedRequest) {
    return this.service.listarPorCajero(req.user.sub);
  }

  @Post(':id/cancelar')
  @Roles('cajero')
  @ApiOperation({ summary: 'Cancela un aviso de abono enviado' })
  async cancelar(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cancelar(req.user.sub, id);
  }
}
