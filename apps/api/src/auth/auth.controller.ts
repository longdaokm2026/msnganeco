import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { authConfig } from "../config/env";
import { AuthService } from "./auth.service";
import type { RequestMetadata } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

const REFRESH_COOKIE = "msngan_refresh";

function metadata(request: Request): RequestMetadata {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent")?.slice(0, 500),
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: authConfig.cookieSecure(),
    sameSite: "strict" as const,
    path: "/auth",
    maxAge: authConfig.refreshTtlSeconds() * 1000,
  };
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  register(
    @Body(
      new ValidationPipe({
        expectedType: RegisterDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: RegisterDto,
  ) {
    return this.auth.register(dto);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @Body(
      new ValidationPipe({
        expectedType: VerifyEmailDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: VerifyEmailDto,
  ) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(
      new ValidationPipe({
        expectedType: LoginDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(dto, metadata(request));
    response.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions());
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body(new ValidationPipe({ expectedType: ForgotPasswordDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body(new ValidationPipe({ expectedType: ResetPasswordDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.refresh(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
      metadata(request),
    );
    response.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions());
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
    );
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: authConfig.cookieSecure(),
      sameSite: "strict",
      path: "/auth",
    });
    return result;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.user);
  }
}
