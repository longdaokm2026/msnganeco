import type {
  AuthUser,
  AuthUserWithPassword,
  CreateUserInput,
  RefreshTokenInput,
  RotateRefreshTokenInput,
  PasswordResetIssue,
} from "./auth.types";

export class DuplicateIdentityError extends Error {}

export abstract class AuthRepository {
  abstract createUser(input: CreateUserInput): Promise<AuthUser>;
  abstract findUserByEmail(email: string): Promise<AuthUserWithPassword | null>;
  abstract findUserById(id: string): Promise<AuthUser | null>;
  abstract verifyEmail(tokenHash: string, now: Date): Promise<AuthUser | null>;
  abstract createRefreshToken(userId: string, input: RefreshTokenInput): Promise<void>;
  abstract rotateRefreshToken(input: RotateRefreshTokenInput, now: Date): Promise<AuthUser | null>;
  abstract revokeRefreshToken(tokenHash: string, now: Date): Promise<void>;
  async issuePasswordReset(email: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetIssue> { void email; void tokenHash; void expiresAt; return null; }
  async completePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<AuthUser | null> { void tokenHash; void passwordHash; void now; return null; }
}
