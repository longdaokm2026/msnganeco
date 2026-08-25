import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AssignmentService } from "./assignment.service";
import { AnswerDto, AssignmentListQueryDto, CreateAssignmentDto, PassageDto, QuestionDto, ReorderDto, UpdateAssignmentDto } from "./dto/assignment.dto";

const validate = <T>(expectedType: new () => T) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentController {
  constructor(@Inject(AssignmentService) private readonly assignments: AssignmentService) {}

  @Get("assignments") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  list(@Req() request: AuthenticatedRequest, @Query(validate(AssignmentListQueryDto)) query: AssignmentListQueryDto) { return this.assignments.listTeacher(request.user.sub, query); }
  @Post("assignments") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  create(@Req() request: AuthenticatedRequest, @Body(validate(CreateAssignmentDto)) body: CreateAssignmentDto) { return this.assignments.create(request.user.sub, body); }
  @Get("assignments/:assignmentId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  detail(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.teacherDetail(request.user.sub, id); }
  @Patch("assignments/:assignmentId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  update(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Body(validate(UpdateAssignmentDto)) body: UpdateAssignmentDto) { return this.assignments.update(request.user.sub, id, body); }
  @Post("assignments/:assignmentId/publish") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  publish(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.transition(request.user.sub, id, "publish"); }
  @Post("assignments/:assignmentId/close") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  close(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.transition(request.user.sub, id, "close"); }
  @Post("assignments/:assignmentId/archive") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  archive(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.transition(request.user.sub, id, "archive"); }
  @Delete("assignments/:assignmentId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  remove(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.delete(request.user.sub, id); }

  @Post("assignments/:assignmentId/questions") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  addQuestion(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Body(validate(QuestionDto)) body: QuestionDto) { return this.assignments.addQuestion(request.user.sub, id, body); }
  @Patch("assignments/:assignmentId/questions/:questionId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  updateQuestion(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Param("questionId", ParseUUIDPipe) questionId: string, @Body(validate(QuestionDto)) body: QuestionDto) { return this.assignments.updateQuestion(request.user.sub, id, questionId, body); }
  @Delete("assignments/:assignmentId/questions/:questionId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  deleteQuestion(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Param("questionId", ParseUUIDPipe) questionId: string) { return this.assignments.deleteQuestion(request.user.sub, id, questionId); }
  @Post("assignments/:assignmentId/questions/reorder") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  reorderQuestions(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Body(validate(ReorderDto)) body: ReorderDto) { return this.assignments.reorderQuestions(request.user.sub, id, body); }

  @Post("assignments/:assignmentId/passages") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  addPassage(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Body(validate(PassageDto)) body: PassageDto) { return this.assignments.addPassage(request.user.sub, id, body); }
  @Patch("assignments/:assignmentId/passages/:passageId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  updatePassage(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Param("passageId", ParseUUIDPipe) passageId: string, @Body(validate(PassageDto)) body: PassageDto) { return this.assignments.updatePassage(request.user.sub, id, passageId, body); }
  @Delete("assignments/:assignmentId/passages/:passageId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  deletePassage(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Param("passageId", ParseUUIDPipe) passageId: string) { return this.assignments.deletePassage(request.user.sub, id, passageId); }
  @Post("assignments/:assignmentId/passages/reorder") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  reorderPassages(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Body(validate(ReorderDto)) body: ReorderDto) { return this.assignments.reorderPassages(request.user.sub, id, body); }

  @Get("assignments/:assignmentId/results") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  results(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.results(request.user.sub, id); }
  @Get("assignments/:assignmentId/results/:studentId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  studentResults(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Param("studentId", ParseUUIDPipe) studentId: string) { return this.assignments.studentResults(request.user.sub, id, studentId); }
  @Get("assignments/:assignmentId/attempts/:attemptId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  teacherAttempt(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string, @Param("attemptId", ParseUUIDPipe) attemptId: string) { return this.assignments.teacherAttempt(request.user.sub, id, attemptId); }

  @Get("student/assignments") @StrictRoles("STUDENT")
  studentList(@Req() request: AuthenticatedRequest, @Query(validate(AssignmentListQueryDto)) query: AssignmentListQueryDto) { return this.assignments.listStudent(request.user.sub, query); }
  @Get("student/assignments/:assignmentId") @StrictRoles("STUDENT")
  studentDetail(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.studentDetail(request.user.sub, id); }
  @Post("student/assignments/:assignmentId/attempts") @StrictRoles("STUDENT")
  start(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) id: string) { return this.assignments.startAttempt(request.user.sub, id); }
  @Get("student/assignment-attempts/:attemptId") @StrictRoles("STUDENT")
  attempt(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) id: string) { return this.assignments.studentAttempt(request.user.sub, id); }
  @Put("student/assignment-attempts/:attemptId/answers/:questionId") @StrictRoles("STUDENT")
  answer(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) id: string, @Param("questionId", ParseUUIDPipe) questionId: string, @Body(validate(AnswerDto)) body: AnswerDto) { return this.assignments.saveAnswer(request.user.sub, id, questionId, body); }
  @Post("student/assignment-attempts/:attemptId/submit") @StrictRoles("STUDENT")
  submit(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) id: string) { return this.assignments.submit(request.user.sub, id); }
  @Get("student/assignment-attempts/:attemptId/result") @StrictRoles("STUDENT")
  result(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) id: string) { return this.assignments.studentAttempt(request.user.sub, id, true); }
}

