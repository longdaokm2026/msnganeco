import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors, ValidationPipe } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AttachmentCategoryDto } from "./dto/attachment-category.dto";
import { LessonListQueryDto } from "./dto/lesson-list-query.dto";
import { UpdateLessonDto } from "./dto/update-lesson.dto";
import { LessonService } from "./lesson.service";
import type { UploadFile } from "./storage/lesson-storage.service";

const validate = <T>(expectedType: new () => T) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonController {
  constructor(@Inject(LessonService) private readonly lessons: LessonService) {}

  @Get("teacher/lessons") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  teacherList(@Req() request: AuthenticatedRequest, @Query(validate(LessonListQueryDto)) query: LessonListQueryDto) { return this.lessons.listTeacher(request.user.sub, query); }

  @Get("sessions/:sessionId/lesson") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  teacherLesson(@Req() request: AuthenticatedRequest, @Param("sessionId", ParseUUIDPipe) sessionId: string) { return this.lessons.teacherLesson(request.user.sub, sessionId); }

  @Put("sessions/:sessionId/lesson") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  update(@Req() request: AuthenticatedRequest, @Param("sessionId", ParseUUIDPipe) sessionId: string, @Body(validate(UpdateLessonDto)) dto: UpdateLessonDto) { return this.lessons.update(request.user.sub, sessionId, dto); }

  @Post("sessions/:sessionId/lesson/publish") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  publish(@Req() request: AuthenticatedRequest, @Param("sessionId", ParseUUIDPipe) sessionId: string) { return this.lessons.publish(request.user.sub, sessionId); }

  @Post("sessions/:sessionId/lesson/archive") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  archive(@Req() request: AuthenticatedRequest, @Param("sessionId", ParseUUIDPipe) sessionId: string) { return this.lessons.archive(request.user.sub, sessionId); }

  @Post("sessions/:sessionId/lesson/attachments") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard) @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@Req() request: AuthenticatedRequest, @Param("sessionId", ParseUUIDPipe) sessionId: string, @UploadedFile() file: UploadFile | undefined, @Body(validate(AttachmentCategoryDto)) body: AttachmentCategoryDto) { return this.lessons.upload(request.user.sub, sessionId, file, body.category); }

  @Delete("sessions/:sessionId/lesson/attachments/:attachmentId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  deleteAttachment(@Req() request: AuthenticatedRequest, @Param("sessionId", ParseUUIDPipe) sessionId: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) { return this.lessons.deleteAttachment(request.user.sub, sessionId, attachmentId); }

  @Get("student/lessons") @StrictRoles("STUDENT")
  studentList(@Req() request: AuthenticatedRequest, @Query(validate(LessonListQueryDto)) query: LessonListQueryDto) { return this.lessons.listStudent(request.user.sub, query); }

  @Get("student/lessons/:lessonId") @StrictRoles("STUDENT")
  studentLesson(@Req() request: AuthenticatedRequest, @Param("lessonId", ParseUUIDPipe) lessonId: string) { return this.lessons.studentLesson(request.user.sub, lessonId); }

  @Get("admin/lessons/:lessonId") @StrictRoles("ADMIN")
  adminLesson(@Param("lessonId", ParseUUIDPipe) lessonId: string) { return this.lessons.adminLesson(lessonId); }

  @Get("lessons/attachments/:attachmentId/download")
  async download(@Req() request: AuthenticatedRequest, @Param("attachmentId", ParseUUIDPipe) attachmentId: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.lessons.download(request.user.sub, request.user.roles, attachmentId);
    response.setHeader("Content-Type", file.fileType); response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`); response.setHeader("Content-Length", String(file.contents.length));
    return new StreamableFile(file.contents);
  }
}
