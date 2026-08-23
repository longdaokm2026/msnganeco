import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { authConfig } from "../config/env";
import { AuthRepository } from "./auth.repository";
import type { AccessTokenPayload } from "./auth.types";

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [type, token] = request.headers.authorization?.split(" ") ?? [];

    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException("Access token is required.");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: authConfig.accessSecret(),
        issuer: authConfig.accessIssuer(),
        audience: authConfig.accessAudience(),
      });
    } catch {
      throw new UnauthorizedException("Access token is invalid or expired.");
    }

    const user = await this.repository.findUserById(payload.sub);
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Tài khoản không còn hoạt động.");
    }
    request.user = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };
    return true;
  }
}
