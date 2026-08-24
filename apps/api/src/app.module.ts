import "dotenv/config";
import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SessionModule } from "./sessions/session.module";
import { ClassroomModule } from "./classes/classroom.module";
import { HealthController } from "./health.controller";
import { GuardianModule } from "./guardians/guardian.module";

@Module({
  imports: [AuthModule, ClassroomModule, DashboardModule, GuardianModule, SessionModule],
  controllers: [HealthController],
})
export class AppModule {}
