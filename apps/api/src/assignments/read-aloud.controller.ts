import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors, ValidationPipe } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ReadAloudGradeDto, ReadAloudTaskDto, ReadAloudUploadDto } from "./read-aloud.dto";
import { ReadAloudService } from "./read-aloud.service";
import type { AudioUploadFile } from "./read-aloud-storage.service";

const validate = <T>(expectedType: new () => T) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });
const stream = (response: Response, file: { fileType: string; fileName: string; contents: Buffer }) => {
  response.setHeader("Content-Type", file.fileType);
  response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  response.setHeader("Content-Length", String(file.contents.length));
  response.setHeader("Cache-Control", "private, no-store");
  return new StreamableFile(file.contents);
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReadAloudController {
  constructor(@Inject(ReadAloudService) private readonly readAloud: ReadAloudService) {}

  @Put("assignments/:assignmentId/read-aloud") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  upsert(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate(ReadAloudTaskDto)) body: ReadAloudTaskDto) { return this.readAloud.upsertTask(request.user.sub, assignmentId, body); }
  @Delete("assignments/:assignmentId/read-aloud") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  remove(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.readAloud.deleteTask(request.user.sub, assignmentId); }
  @Get("assignments/:assignmentId/read-aloud/results") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  results(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.readAloud.results(request.user.sub, assignmentId); }
  @Patch("assignments/:assignmentId/read-aloud/submissions/:submissionId/grade") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  grade(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("submissionId", ParseUUIDPipe) submissionId: string, @Body(validate(ReadAloudGradeDto)) body: ReadAloudGradeDto) { return this.readAloud.grade(request.user.sub, assignmentId, submissionId, body.score, body.feedback); }

  @Get("student/assignments/:assignmentId/read-aloud") @StrictRoles("STUDENT")
  studentTask(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.readAloud.studentTask(request.user.sub, assignmentId); }
  @Post("student/assignment-attempts/:attemptId/read-aloud/upload") @StrictRoles("STUDENT") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  upload(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) attemptId: string, @UploadedFile() file: AudioUploadFile | undefined, @Body(validate(ReadAloudUploadDto)) body: ReadAloudUploadDto) { return this.readAloud.upload(request.user.sub, attemptId, file, body.durationSeconds); }
  @Get("student/assignment-attempts/:attemptId/read-aloud/audio") @StrictRoles("STUDENT")
  async ownAudio(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) attemptId: string, @Res({ passthrough: true }) response: Response) { return stream(response, await this.readAloud.audioForAttempt(request.user.sub, attemptId)); }

  @Get("assignment-read-aloud-submissions/:submissionId/audio") @StrictRoles("STUDENT", "TEACHER", "ADMIN")
  async audio(@Req() request: AuthenticatedRequest, @Param("submissionId", ParseUUIDPipe) submissionId: string, @Res({ passthrough: true }) response: Response) { return stream(response, await this.readAloud.audio(request.user.sub, request.user.roles, submissionId)); }
}
