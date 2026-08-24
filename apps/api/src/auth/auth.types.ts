import type { Role, UserStatus } from "../../../../generated/prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  status: UserStatus;
  roles: Role[];
}

export interface AuthUserWithPassword extends AuthUser {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  phone: string;
  fullName: string;
  passwordHash: string;
  role: Exclude<Role, "ADMIN">;
  studentCode?: string;
  verificationTokenHash: string;
  verificationExpiresAt: Date;
}

export interface RefreshTokenInput {
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface RotateRefreshTokenInput extends RefreshTokenInput {
  currentTokenHash: string;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export type PasswordResetIssue = { email: string } | null;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: Role[];
}
