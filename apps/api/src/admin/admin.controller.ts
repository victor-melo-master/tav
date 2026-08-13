import { Body, Controller, Post, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('usuarios')
  async crearUsuario(@Body() dto: CrearUsuarioDto, @Req() req: any) {
    // creadoPorId sale del JWT, nunca del body.
    return this.admin.crearUsuario(dto, req.user.sub);
  }
}
