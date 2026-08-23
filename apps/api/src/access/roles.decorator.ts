import { applyDecorators, SetMetadata } from "@nestjs/common";
import type { Role } from "../../../../generated/prisma/client";

export const ROLES_KEY = "required_roles";
export const ADMIN_BYPASS_KEY = "admin_role_bypass";

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const StrictRoles = (...roles: Role[]) => applyDecorators(
  SetMetadata(ROLES_KEY, roles),
  SetMetadata(ADMIN_BYPASS_KEY, false),
);
