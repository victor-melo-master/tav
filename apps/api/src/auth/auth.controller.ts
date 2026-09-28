import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  async logout(@Req() req: AuthenticatedRequest) {
    return this.auth.logout(req.user.sub);
  }

  @Post('logout-all')
  async logoutAll(@Req() req: AuthenticatedRequest) {
    return this.auth.logoutAll(req.user.sub);
  }

  @Post('cambiar-contrasena')
  async cambiarContrasena(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CambiarContrasenaDto,
  ) {
    return this.auth.cambiarContrasena(req.user.sub, dto);
  }

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.user.sub);
  }

}
