import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminRepository } from "./admin.repository";
import { AdminService } from "./admin.service";
import { PrismaAdminRepository } from "./prisma-admin.repository";

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    RolesGuard,
    { provide: AdminRepository, useClass: PrismaAdminRepository },
  ],
})
export class AdminModule {}
