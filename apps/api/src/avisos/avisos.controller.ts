import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AvisosService } from './avisos.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Avisos (notificaciones)')
@Controller()
export class AvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get('cajero/avisos')
  @Roles('cajero')
  @ApiOperation({ summary: 'Lista las notificaciones del cajero' })
  @ApiResponse({ status: 200, description: 'Avisos no resueltos' })
  async listarCajero(@Req() req: AuthenticatedRequest) {
    return this.avisos.listarPorCajero(req.user.sub);
  }

  @Post('cajero/avisos/:id/leer')
  @Roles('cajero')
  @ApiOperation({ summary: 'Marca una notificación como leída' })
  @ApiResponse({ status: 200, description: 'Aviso actualizado' })
  async marcarLeido(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.avisos.marcarLeido(req.user.sub, id);
  }

  @Get('cobrador/avisos')
  @Roles('cobrador')
  @ApiOperation({ summary: 'Lista las notificaciones que el cobrador debe ver' })
  @ApiResponse({ status: 200, description: 'Avisos no resueltos' })
  async listarCobrador() {
    return this.avisos.listarParaCobrador();
  }
}
