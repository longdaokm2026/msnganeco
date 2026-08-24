import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardRepository } from "./dashboard.repository";
import { DashboardService } from "./dashboard.service";
import { PrismaDashboardRepository } from "./prisma-dashboard.repository";

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    RolesGuard,
    { provide: DashboardRepository, useClass: PrismaDashboardRepository },
  ],
})
export class DashboardModule {}
