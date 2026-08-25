import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { QuickQuizDto } from "./quick-quiz.dto";
import { QuickQuizService } from "./quick-quiz.service";

const validate = new ValidationPipe({ expectedType: QuickQuizDto, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuickQuizController {
  constructor(@Inject(QuickQuizService) private readonly quizzes: QuickQuizService) {}
  @Post("quick-quizzes") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  create(@Req() request: AuthenticatedRequest, @Body(validate) body: QuickQuizDto) { return this.quizzes.create(request.user.sub, body); }
  @Post("quick-quizzes/:assignmentId/regenerate") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  regenerate(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate) body: QuickQuizDto) { return this.quizzes.regenerate(request.user.sub, assignmentId, body); }
  @Get("assignments/:assignmentId/leaderboard") @StrictRoles("TEACHER", "STUDENT")
  leaderboard(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.quizzes.leaderboard(request.user.sub, request.user.roles, assignmentId); }
}
