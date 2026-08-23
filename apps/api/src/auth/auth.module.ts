import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { authConfig } from "../config/env";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PrismaAuthRepository } from "./prisma-auth.repository";

@Module({
  imports: [
    JwtModule.register({
      secret: authConfig.accessSecret(),
      signOptions: {
        expiresIn: authConfig.accessTtlSeconds(),
        issuer: authConfig.accessIssuer(),
        audience: authConfig.accessAudience(),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    { provide: AuthRepository, useClass: PrismaAuthRepository },
  ],
  exports: [AuthRepository, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
