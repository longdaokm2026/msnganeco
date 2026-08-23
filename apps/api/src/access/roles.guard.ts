import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "../../../../generated/prisma/client";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ADMIN_BYPASS_KEY, ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const adminBypass = this.reflector.getAllAndOverride<boolean>(ADMIN_BYPASS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? true;
    const allowed = (adminBypass && user.roles.includes("ADMIN")) ||
      requiredRoles.some((role) => user.roles.includes(role));

    if (!allowed) {
      throw new ForbiddenException("Bạn không có quyền truy cập chức năng này.");
    }
    return true;
  }
}
