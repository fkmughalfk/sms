import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthUser,
  type ChangePasswordInput,
  changePasswordSchema,
  type LoginInput,
  loginSchema,
} from '@sms/shared';
import type { Request, Response } from 'express';
import { ClientIp, CurrentUser, Public } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { REFRESH_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';

const refreshCookie = (req: Request) =>
  (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Spec §5.1: 5 attempts / min / IP. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @ClientIp() ip: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    return this.auth.login(body, ip, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthUser> {
    return this.auth.refresh(refreshCookie(req), res);
  }

  /** Public so an expired access token can still sign out. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    return this.auth.logout(refreshCookie(req), res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @ClientIp() ip: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.auth.changePassword(user, body, ip, res);
  }
}
