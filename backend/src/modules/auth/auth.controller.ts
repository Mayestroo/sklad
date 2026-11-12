import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterCompanyDto, LoginDto, RefreshTokenDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AppRequest } from '../../common/auth/request-context';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { strictThrottle } from '../../common/rate-limit/rate-limit';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(strictThrottle('register'))
  register(@Body() dto: RegisterCompanyDto) {
    return this.authService.registerCompany(dto);
  }

  @Post('login')
  @Throttle(strictThrottle('login'))
  login(@Body() dto: LoginDto, @Req() req: AppRequest) {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.authService.login(dto, ipAddress);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }
}
