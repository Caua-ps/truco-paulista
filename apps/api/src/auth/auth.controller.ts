import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { AuthService, GoogleProfile } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Limites mais agressivos nas rotas sensíveis a força bruta.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.identifier, dto.password);
  }

  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogoutDto) {
    await this.auth.logout(user.id, dto.refreshToken, dto.allDevices);
  }

  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @HttpCode(200)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.resendVerification(user.id);
    return { ok: true };
  }

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Google OAuth: /auth/google redireciona ao consentimento; o callback emite
  // os tokens e devolve o usuário ao frontend.
  // ---------------------------------------------------------------------------

  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleAuth() {
    // Redirecionamento tratado pelo passport.
  }

  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(@Req() req: { user: GoogleProfile }, @Res() res: Response) {
    const { tokens } = await this.auth.loginWithGoogle(req.user);
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    // Tokens no fragment (#) não chegam ao servidor web nem ficam em logs.
    res.redirect(
      `${origin}/auth/callback#accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }
}
