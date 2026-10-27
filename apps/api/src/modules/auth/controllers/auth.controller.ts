import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  SignInInputSchema,
  type SignInInput,
  type SignInResponse,
  TotpSetupInputSchema,
  type TotpSetupInput,
  type TotpSetupResponse,
  TotpVerifyInputSchema,
  type TotpVerifyInput,
  RefreshTokenInputSchema,
  type RefreshTokenInput,
  type RefreshTokenResponse,
  ChangePasswordInputSchema,
  type ChangePasswordInput,
  type ChangePasswordResponse,
  AdminResetPasswordInputSchema,
  type AdminResetPasswordInput,
  type AdminResetPasswordResponse,
  type AuthMeResponse,
  type SignOutResponse,
} from '@idmis/contracts';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../token.service';
import { Public, CurrentUser } from '../../../platform/auth';
import { ZodValidationPipe } from '../../../platform/pipes';
import {
  parseCookies,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE_NAME,
} from '../cookie.helper';
import type { RequestUser } from '../../../platform/context';

function assertAllowedOrigin(req: FastifyRequest): void {
  const origin = req.headers.origin;
  if (!origin) return;
  const configuredAppUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const requestOrigin = origin.replace(/\/+$/, '');
  if (requestOrigin !== configuredAppUrl) {
    throw new ForbiddenException('Invalid origin for authentication request');
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body(new ZodValidationPipe(SignInInputSchema)) body: SignInInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SignInResponse> {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    const result = await this.authService.signIn(body, userAgent, ip);

    if (result.rawRefreshToken) {
      setRefreshTokenCookie(res, result.rawRefreshToken);
    }

    return result.response as SignInResponse;
  }

  @Public()
  @Post('totp/setup')
  @HttpCode(200)
  async setupTotp(
    @Body(new ZodValidationPipe(TotpSetupInputSchema)) body: TotpSetupInput,
  ): Promise<TotpSetupResponse> {
    return this.authService.setupTotp(body.tempToken);
  }

  @Public()
  @Post('totp/verify')
  @HttpCode(200)
  async verifyTotp(
    @Body(new ZodValidationPipe(TotpVerifyInputSchema)) body: TotpVerifyInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SignInResponse> {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    const result = await this.authService.verifyTotp(body, userAgent, ip);

    if (result.rawRefreshToken) {
      setRefreshTokenCookie(res, result.rawRefreshToken);
    }

    return result.response as SignInResponse;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenInputSchema)) _body: RefreshTokenInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<RefreshTokenResponse> {
    assertAllowedOrigin(req);

    const cookies = parseCookies(req.headers.cookie);
    const rawCookieToken = cookies[REFRESH_TOKEN_COOKIE_NAME];
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    const result = await this.authService.refresh(rawCookieToken, userAgent, ip);

    if (result.rawRefreshToken) {
      setRefreshTokenCookie(res, result.rawRefreshToken);
    }

    return result.response as RefreshTokenResponse;
  }

  @Public()
  @Post('sign-out')
  @HttpCode(200)
  async signOut(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SignOutResponse> {
    assertAllowedOrigin(req);

    const cookies = parseCookies(req.headers.cookie);
    const rawCookieToken = cookies[REFRESH_TOKEN_COOKIE_NAME];

    clearRefreshTokenCookie(res);

    return this.authService.signOut(rawCookieToken);
  }

  @Get('me')
  async getMe(@CurrentUser() user: RequestUser): Promise<AuthMeResponse> {
    return this.authService.getMe(user.id);
  }

  @Public()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body(new ZodValidationPipe(ChangePasswordInputSchema)) body: ChangePasswordInput,
    @Req() req: FastifyRequest,
  ): Promise<ChangePasswordResponse> {
    let userId: string;
    let tempJtiToBurn: string | null = null;
    let currentSessionId: string | undefined;

    if (body.tempToken) {
      const { sub, jti } = await this.tokenService.verifyTempToken(
        body.tempToken,
        'password_change',
      );
      userId = sub;
      tempJtiToBurn = jti;
    } else {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentication required to change password');
      }
      const token = authHeader.slice(7).trim();
      const payload = await this.tokenService.verifyAccessToken(token);
      userId = payload.sub;
      currentSessionId = payload.sid;
    }

    const result = await this.authService.changePassword(userId, body, currentSessionId);

    if (tempJtiToBurn) {
      await this.tokenService.burnTempTokenJti(tempJtiToBurn);
    }

    return result;
  }

  @Post('reset-password')
  @HttpCode(200)
  async adminResetPassword(
    @Body(new ZodValidationPipe(AdminResetPasswordInputSchema)) body: AdminResetPasswordInput,
    @CurrentUser() callerAdmin: RequestUser,
  ): Promise<AdminResetPasswordResponse> {
    return this.authService.adminResetPassword(body.userId, callerAdmin);
  }
}
