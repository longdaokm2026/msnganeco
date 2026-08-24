import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { Role, UserStatus } from "../../../../generated/prisma/client";
import { authConfig } from "../config/env";
import { AuthRepository, DuplicateIdentityError } from "./auth.repository";
import type {
  AccessTokenPayload,
  AuthUser,
  RequestMetadata,
} from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { MailService } from "../mail/mail.service";

const ARGON_OPTIONS = {
  // @node-rs/argon2 exposes Algorithm as an ambient const enum, which is not
  // compatible with the web project's isolatedModules setting. Value 2 is Argon2id.
  algorithm: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

function normalizePhone(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("0")) phone = `+84${phone.slice(1)}`;
  else if (phone.startsWith("84")) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new BadRequestException("Số điện thoại không hợp lệ.");
  }
  return phone;
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    status: user.status,
    roles: user.roles,
  };
}

@Injectable()
export class AuthService {
  private readonly dummyHash = hash("invalid-login-password", ARGON_OPTIONS);

  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const verificationToken = randomToken();
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hash(dto.password, ARGON_OPTIONS);

    try {
      const user = await this.repository.createUser({
        email,
        phone: normalizePhone(dto.phone),
        fullName: dto.fullName.trim().replace(/\s+/g, " "),
        passwordHash,
        role: dto.role as Exclude<Role, "ADMIN">,
        studentCode: dto.studentCode?.trim() || undefined,
        verificationTokenHash: sha256(verificationToken),
        verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await this.mail.sendVerificationEmail(email, verificationToken);
      return {
        user: publicUser(user),
        verificationRequired: true,
        ...(authConfig.exposeDevTokens() ? { verificationToken } : {}),
      };
    } catch (error) {
      if (error instanceof DuplicateIdentityError) {
        throw new ConflictException("Email hoặc số điện thoại đã được sử dụng.");
      }
      throw error;
    }
  }

  async verifyEmail(token: string) {
    const user = await this.repository.verifyEmail(sha256(token), new Date());
    if (!user) {
      throw new BadRequestException("Mã xác minh không hợp lệ hoặc đã hết hạn.");
    }
    return { user: publicUser(user) };
  }

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(email);
    const passwordMatches = user
      ? await verify(user.passwordHash, dto.password)
      : await verify(await this.dummyHash, dto.password);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng.");
    }
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException("Vui lòng xác minh email trước khi đăng nhập.");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Tài khoản hiện không hoạt động.");
    }

    return this.createSession(user, metadata);
  }

  async refresh(currentToken: string | undefined, metadata: RequestMetadata) {
    if (!currentToken) throw new UnauthorizedException("Phiên đăng nhập không hợp lệ.");

    const nextToken = randomToken();
    const now = new Date();
    const user = await this.repository.rotateRefreshToken(
      {
        currentTokenHash: sha256(currentToken),
        tokenHash: sha256(nextToken),
        expiresAt: new Date(now.getTime() + authConfig.refreshTtlSeconds() * 1000),
        ...metadata,
      },
      now,
    );


    if (!user) throw new UnauthorizedException("Phiên đăng nhập không hợp lệ.");

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: nextToken,
      user: publicUser(user),
    };
  }

  async logout(currentToken: string | undefined) {
    if (currentToken) {
      await this.repository.revokeRefreshToken(sha256(currentToken), new Date());
    }
    return { success: true };
  }

  async me(payload: AccessTokenPayload) {
    const user = await this.repository.findUserById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Tài khoản không còn hoạt động.");
    }

    return { user: publicUser(user) };
  }

  private async createSession(user: AuthUser, metadata: RequestMetadata) {
    const refreshToken = randomToken();
    await this.repository.createRefreshToken(user.id, {
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + authConfig.refreshTtlSeconds() * 1000),
      ...metadata,
    });

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      user: publicUser(user),
    };
  }

  private signAccessToken(user: AuthUser) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };
    return this.jwt.signAsync(payload, {
      secret: authConfig.accessSecret(),
      expiresIn: authConfig.accessTtlSeconds(),
      issuer: authConfig.accessIssuer(),
      audience: authConfig.accessAudience(),
    });
  }
}
