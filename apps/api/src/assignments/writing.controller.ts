import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { EssayAutosaveDto, EssayGradeDto, TranslationAutosaveDto, TranslationGradeDto, TranslationItemDto, WritingFeedbackDto, WritingReorderDto, WritingTaskDto } from "./writing.dto";
import { WritingService } from "./writing.service";

const validate = <T>(expectedType: new () => T) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WritingController {
  constructor(@Inject(WritingService) private readonly writing: WritingService) {}

  @Put("assignments/:assignmentId/writing") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  upsert(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate(WritingTaskDto)) body: WritingTaskDto) { return this.writing.upsertTask(request.user.sub, assignmentId, body); }
  @Delete("assignments/:assignmentId/writing") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  remove(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.writing.deleteTask(request.user.sub, assignmentId); }
  @Post("assignments/:assignmentId/writing/translation-items") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  addItem(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate(TranslationItemDto)) body: TranslationItemDto) { return this.writing.addItem(request.user.sub, assignmentId, body); }
  @Patch("assignments/:assignmentId/writing/translation-items/:itemId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  updateItem(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("itemId", ParseUUIDPipe) itemId: string, @Body(validate(TranslationItemDto)) body: TranslationItemDto) { return this.writing.updateItem(request.user.sub, assignmentId, itemId, body); }
  @Delete("assignments/:assignmentId/writing/translation-items/:itemId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  deleteItem(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("itemId", ParseUUIDPipe) itemId: string) { return this.writing.deleteItem(request.user.sub, assignmentId, itemId); }
  @Post("assignments/:assignmentId/writing/translation-items/reorder") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  reorder(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate(WritingReorderDto)) body: WritingReorderDto) { return this.writing.reorderItems(request.user.sub, assignmentId, body.ids); }

  @Get("student/assignments/:assignmentId/writing") @StrictRoles("STUDENT")
  studentTask(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.writing.studentTask(request.user.sub, assignmentId); }
  @Get("student/assignment-attempts/:attemptId/writing") @StrictRoles("STUDENT")
  studentAttempt(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) attemptId: string) { return this.writing.studentAttempt(request.user.sub, attemptId); }
  @Put("student/assignment-attempts/:attemptId/writing/essay") @StrictRoles("STUDENT")
  essay(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) attemptId: string, @Body(validate(EssayAutosaveDto)) body: EssayAutosaveDto) { return this.writing.saveEssay(request.user.sub, attemptId, body.content); }
  @Put("student/assignment-attempts/:attemptId/writing/translation/:itemId") @StrictRoles("STUDENT")
  translation(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) attemptId: string, @Param("itemId", ParseUUIDPipe) itemId: string, @Body(validate(TranslationAutosaveDto)) body: TranslationAutosaveDto) { return this.writing.saveTranslation(request.user.sub, attemptId, itemId, body.answerText); }

  @Patch("assignments/:assignmentId/writing/submissions/:submissionId/essay-grade") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  gradeEssay(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("submissionId", ParseUUIDPipe) submissionId: string, @Body(validate(EssayGradeDto)) body: EssayGradeDto) { return this.writing.gradeEssay(request.user.sub, assignmentId, submissionId, body.score, body.feedback); }
  @Patch("assignments/:assignmentId/writing/submissions/:submissionId/translation/:answerId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  gradeTranslation(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("submissionId", ParseUUIDPipe) submissionId: string, @Param("answerId", ParseUUIDPipe) answerId: string, @Body(validate(TranslationGradeDto)) body: TranslationGradeDto) { return this.writing.gradeTranslation(request.user.sub, assignmentId, submissionId, answerId, body.isCorrect, body.teacherComment); }
  @Patch("assignments/:assignmentId/writing/submissions/:submissionId/feedback") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  feedback(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("submissionId", ParseUUIDPipe) submissionId: string, @Body(validate(WritingFeedbackDto)) body: WritingFeedbackDto) { return this.writing.saveFeedback(request.user.sub, assignmentId, submissionId, body.feedback); }
}
