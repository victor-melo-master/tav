import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SetPinDto, LoginPinDto } from './dto/login.dto';
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
  async logout(@Req() req: any) {
    return this.auth.logout(req.user.sub);
  }

  @Post('logout-all')
  async logoutAll(@Req() req: any) {
    return this.auth.logoutAll(req.user.sub);
  }

  @Get('me')
  async me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }

  @Post('pin')
  async setPin(@Req() req: any, @Body() dto: SetPinDto) {
    return this.auth.setPin(req.user.sub, dto);
  }

  @Public()
  @Post('login-pin')
  async loginPin(@Body() dto: LoginPinDto) {
    return this.auth.loginPin(dto);
  }
}
