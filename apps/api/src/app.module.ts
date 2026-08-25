import "dotenv/config";
import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SessionModule } from "./sessions/session.module";
import { ClassroomModule } from "./classes/classroom.module";
import { HealthController } from "./health.controller";
import { GuardianModule } from "./guardians/guardian.module";
import { AdminModule } from "./admin/admin.module";
import { TeacherApprovalAccessModule } from "./access/teacher-approval-access";
import { LessonModule } from "./lessons/lesson.module";
import { AssignmentModule } from "./assignments/assignment.module";
import { QuizGenerationModule } from "./quiz-generation/quiz-generation.module";

@Module({
  imports: [TeacherApprovalAccessModule, AdminModule, AssignmentModule, AuthModule, ClassroomModule, DashboardModule, GuardianModule, LessonModule, QuizGenerationModule, SessionModule],
  controllers: [HealthController],
})
export class AppModule {}
