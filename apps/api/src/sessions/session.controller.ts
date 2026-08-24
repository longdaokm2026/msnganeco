import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { StrictRoles } from "../access/roles.decorator";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CreateSessionDto } from "./dto/create-session.dto";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";
import { RequestAbsenceDto } from "./dto/request-absence.dto";
import { ReviewAbsenceDto } from "./dto/review-absence.dto";
import { SessionService } from "./session.service";

const validate = <T>(expectedType: new () => T) =>
  new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  @Post("classes/:classroomId/sessions")
  @StrictRoles("TEACHER")
  @UseGuards(ApprovedTeacherGuard)
  createSession(
    @Req() request: AuthenticatedRequest,
    @Param("classroomId", ParseUUIDPipe) classroomId: string,
    @Body(validate(CreateSessionDto)) dto: CreateSessionDto,
  ) {
    return this.sessions.createSession(request.user.sub, classroomId, dto);
  }

  @Get("classes/:classroomId/sessions")
  @StrictRoles("TEACHER")
  @UseGuards(ApprovedTeacherGuard)
  listClassSessions(
    @Req() request: AuthenticatedRequest,
    @Param("classroomId", ParseUUIDPipe) classroomId: string,
  ) {
    return this.sessions.listClassSessions(request.user.sub, classroomId);
  }

  @Get("sessions/:sessionId/attendance")
  @StrictRoles("TEACHER")
  @UseGuards(ApprovedTeacherGuard)
  attendanceSheet(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessions.attendanceSheet(request.user.sub, sessionId);
  }

  @Put("sessions/:sessionId/attendance")
  @StrictRoles("TEACHER")
  @UseGuards(ApprovedTeacherGuard)
  markAttendance(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body(validate(MarkAttendanceDto)) dto: MarkAttendanceDto,
  ) {
    return this.sessions.markAttendance(request.user.sub, sessionId, dto);
  }

  @Get("student/sessions")
  @StrictRoles("STUDENT")
  listStudentSessions(@Req() request: AuthenticatedRequest) {
    return this.sessions.listStudentSessions(request.user.sub);
  }

  @Post("sessions/:sessionId/absence-requests")
  @StrictRoles("STUDENT")
  requestAbsence(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body(validate(RequestAbsenceDto)) dto: RequestAbsenceDto,
  ) {
    return this.sessions.requestAbsence(request.user.sub, sessionId, dto.reason);
  }

  @Patch("absence-requests/:requestId/review")
  @StrictRoles("TEACHER")
  @UseGuards(ApprovedTeacherGuard)
  reviewAbsence(
    @Req() request: AuthenticatedRequest,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body(validate(ReviewAbsenceDto)) dto: ReviewAbsenceDto,
  ) {
    return this.sessions.reviewAbsence(request.user.sub, requestId, dto);
  }
}
