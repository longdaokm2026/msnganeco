import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { RequestStudentLinkDto } from "./dto/request-student-link.dto";
import { ReviewGuardianLinkDto } from "./dto/review-guardian-link.dto";
import { GuardianService } from "./guardian.service";

const validate = <T>(expectedType: new () => T) =>
  new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuardianController {
  constructor(@Inject(GuardianService) private readonly guardians: GuardianService) {}

  @Post("guardian/student-links")
  @StrictRoles("GUARDIAN")
  requestLink(
    @Req() request: AuthenticatedRequest,
    @Body(validate(RequestStudentLinkDto)) dto: RequestStudentLinkDto,
  ) {
    return this.guardians.requestLink(request.user.sub, dto);
  }

  @Get("guardian/student-links")
  @StrictRoles("GUARDIAN")
  listForGuardian(@Req() request: AuthenticatedRequest) {
    return this.guardians.listForGuardian(request.user.sub);
  }

  @Delete("guardian/student-links/:studentId")
  @StrictRoles("GUARDIAN")
  revokeByGuardian(
    @Req() request: AuthenticatedRequest,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    return this.guardians.revokeByGuardian(request.user.sub, studentId);
  }

  @Get("guardian/students/:studentId/overview")
  @StrictRoles("GUARDIAN")
  studentOverview(
    @Req() request: AuthenticatedRequest,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    return this.guardians.studentOverview(request.user.sub, studentId);
  }

  @Get("student/guardian-links")
  @StrictRoles("STUDENT")
  listForStudent(@Req() request: AuthenticatedRequest) {
    return this.guardians.listForStudent(request.user.sub);
  }

  @Patch("student/guardian-links/:guardianId")
  @StrictRoles("STUDENT")
  reviewLink(
    @Req() request: AuthenticatedRequest,
    @Param("guardianId", ParseUUIDPipe) guardianId: string,
    @Body(validate(ReviewGuardianLinkDto)) dto: ReviewGuardianLinkDto,
  ) {
    return this.guardians.reviewLink(request.user.sub, guardianId, dto);
  }

  @Delete("student/guardian-links/:guardianId")
  @StrictRoles("STUDENT")
  revokeByStudent(
    @Req() request: AuthenticatedRequest,
    @Param("guardianId", ParseUUIDPipe) guardianId: string,
  ) {
    return this.guardians.revokeByStudent(request.user.sub, guardianId);
  }
}
