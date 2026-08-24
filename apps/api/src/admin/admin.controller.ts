import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminService } from "./admin.service";
import {
  ListAuditLogsDto,
  ListClassroomsDto,
  ListUsersDto,
  PaginationDto,
  RejectTeacherDto,
  UpdateUserStatusDto,
} from "./dto/admin.dto";

const validate = <T>(expectedType: new () => T) => new ValidationPipe({
  expectedType,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@StrictRoles("ADMIN")
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("overview")
  overview() { return this.admin.overview(); }

  @Get("users")
  users(@Query(validate(ListUsersDto)) query: ListUsersDto) { return this.admin.listUsers(query); }

  @Get("users/:userId")
  user(@Param("userId", ParseUUIDPipe) userId: string) { return this.admin.userDetail(userId); }

  @Patch("users/:userId/status")
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(validate(UpdateUserStatusDto)) dto: UpdateUserStatusDto,
  ) {
    return this.admin.updateUserStatus(request.user.sub, userId, dto.status);
  }

  @Get("teachers/pending")
  pendingTeachers(@Query(validate(PaginationDto)) query: PaginationDto) {
    return this.admin.pendingTeachers(query.page, query.pageSize);
  }

  @Post("teachers/:userId/approve")
  approveTeacher(
    @Req() request: AuthenticatedRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.admin.reviewTeacher(request.user.sub, userId, "APPROVED");
  }

  @Post("teachers/:userId/reject")
  rejectTeacher(
    @Req() request: AuthenticatedRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(validate(RejectTeacherDto)) dto: RejectTeacherDto,
  ) {
    return this.admin.reviewTeacher(request.user.sub, userId, "REJECTED", dto.rejectionNote);
  }

  @Get("classrooms")
  classrooms(@Query(validate(ListClassroomsDto)) query: ListClassroomsDto) {
    return this.admin.listClassrooms(query);
  }

  @Get("classrooms/:classroomId")
  classroom(@Param("classroomId", ParseUUIDPipe) classroomId: string) {
    return this.admin.classroomDetail(classroomId);
  }

  @Get("audit-logs")
  auditLogs(@Query(validate(ListAuditLogsDto)) query: ListAuditLogsDto) {
    return this.admin.listAuditLogs({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    });
  }
}
