import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { GuardianController } from "./guardian.controller";
import { GuardianRepository } from "./guardian.repository";
import { GuardianService } from "./guardian.service";
import { PrismaGuardianRepository } from "./prisma-guardian.repository";

@Module({
  imports: [AuthModule],
  controllers: [GuardianController],
  providers: [
    GuardianService,
    RolesGuard,
    { provide: GuardianRepository, useClass: PrismaGuardianRepository },
  ],
})
export class GuardianModule {}
