import { Injectable } from "@nestjs/common";
import {
  Prisma,
  Role,
  UserStatus,
  VerificationPurpose,
} from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { AuthRepository, DuplicateIdentityError } from "./auth.repository";
import type {
  AuthUser,
  AuthUserWithPassword,
  CreateUserInput,
  RefreshTokenInput,
  RotateRefreshTokenInput,
} from "./auth.types";

type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: true } }>;

function toAuthUser(user: UserWithRoles): AuthUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    status: user.status,
    roles: user.roles.map(({ role }) => role),
  };
}

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  async createUser(input: CreateUserInput): Promise<AuthUser> {
    try {
      const user = await prisma.$transaction(async (tx) => {
        const profile =
          input.role === Role.STUDENT
            ? { studentProfile: { create: { studentCode: input.studentCode } } }
            : input.role === Role.TEACHER
              ? { teacherProfile: { create: {} } }
              : { guardianProfile: { create: {} } };

        const created = await tx.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            fullName: input.fullName,
            passwordHash: input.passwordHash,
            roles: { create: { role: input.role } },
            verificationTokens: {
              create: {
                purpose: VerificationPurpose.EMAIL_VERIFICATION,
                tokenHash: input.verificationTokenHash,
                expiresAt: input.verificationExpiresAt,
              },
            },
            ...profile,
          },
          include: { roles: true },
        });

        await tx.auditLog.create({
          data: {
            actorId: created.id,
            action: "USER_REGISTERED",
            entityType: "User",
            entityId: created.id,
            metadata: { role: input.role },
          },
        });

        return created;
      });

      return toAuthUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateIdentityError("Email or phone already exists.");
      }
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<AuthUserWithPassword | null> {
    const user = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
    return user ? { ...toAuthUser(user), passwordHash: user.passwordHash } : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    return user ? toAuthUser(user) : null;
  }

  async verifyEmail(tokenHash: string, now: Date): Promise<AuthUser | null> {
    return prisma.$transaction(async (tx) => {
      const token = await tx.verificationToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { roles: true } } },
      });

      if (
        !token ||
        token.purpose !== VerificationPurpose.EMAIL_VERIFICATION ||
        token.usedAt ||
        token.expiresAt <= now
      ) {
        return null;
      }

      const consumed = await tx.verificationToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return null;

      const user = await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now, status: UserStatus.ACTIVE },
        include: { roles: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "EMAIL_VERIFIED",
          entityType: "User",
          entityId: user.id,
        },
      });

      return toAuthUser(user);
    });
  }

  async createRefreshToken(userId: string, input: RefreshTokenInput): Promise<void> {
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async rotateRefreshToken(input: RotateRefreshTokenInput, now: Date): Promise<AuthUser | null> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: input.currentTokenHash },
        include: { user: { include: { roles: true } } },
      });

      if (!current || current.expiresAt <= now) return null;
      if (current.revokedAt) {
        await this.revokeCompromisedFamily(tx, current.familyId, current.userId, now);
        return null;
      }
      if (current.user.status !== UserStatus.ACTIVE) return null;

      const revoked = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, lastUsedAt: now },
      });
      if (revoked.count !== 1) {
        await this.revokeCompromisedFamily(tx, current.familyId, current.userId, now);
        return null;
      }

      await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });

      return toAuthUser(current.user);
    });
  }

  async revokeRefreshToken(tokenHash: string, now: Date): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async revokeCompromisedFamily(
    tx: Prisma.TransactionClient,
    familyId: string,
    userId: string,
    now: Date,
  ) {
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        entityType: "RefreshTokenFamily",
        entityId: familyId,
      },
    });
  }
}
