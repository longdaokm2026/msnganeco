import { Controller, Get, Inject, Query, Req, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles, StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { TeacherAttendanceQueryDto } from "./dto/teacher-attendance-query.dto";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get("overview")
  overview(@Req() request: AuthenticatedRequest) {
    return this.dashboard.overview(request.user);
  }

  @Get("teacher/attendance")
  @StrictRoles("TEACHER")
  teacherAttendance(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidationPipe({ expectedType: TeacherAttendanceQueryDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) query: TeacherAttendanceQueryDto,
  ) {
    return this.dashboard.teacherAttendance(request.user.sub, query.month);
  }

  @Get("student/attendance")
  @StrictRoles("STUDENT")
  studentAttendance(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidationPipe({ expectedType: TeacherAttendanceQueryDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) query: TeacherAttendanceQueryDto,
  ) {
    return this.dashboard.studentAttendance(request.user.sub, query.month);
  }

  @Get("teaching")
  @Roles("TEACHER")
  teaching() {
    return this.dashboard.teachingAccess();
  }

  @Get("learning")
  @Roles("STUDENT")
  learning() {
    return this.dashboard.learningAccess();
  }

  @Get("guardian")
  @Roles("GUARDIAN")
  guardian() {
    return this.dashboard.guardianAccess();
  }

  @Get("administration")
  @Roles("ADMIN")
  administration() {
    return this.dashboard.administrationAccess();
  }
}
