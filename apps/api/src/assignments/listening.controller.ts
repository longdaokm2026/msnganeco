import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors, ValidationPipe } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { StrictRoles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import type { AudioUploadFile } from "./assignment-audio-storage.service";
import { ListeningTrackDto, ListeningTrackReorderDto } from "./listening.dto";
import { ListeningService } from "./listening.service";

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
export class ListeningController {
  constructor(@Inject(ListeningService) private readonly listening: ListeningService) {}

  @Post("assignments/:assignmentId/listening-tracks") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  create(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate(ListeningTrackDto)) body: ListeningTrackDto) { return this.listening.createTrack(request.user.sub, assignmentId, body); }
  @Patch("assignments/:assignmentId/listening-tracks/:trackId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  update(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("trackId", ParseUUIDPipe) trackId: string, @Body(validate(ListeningTrackDto)) body: ListeningTrackDto) { return this.listening.updateTrack(request.user.sub, assignmentId, trackId, body); }
  @Delete("assignments/:assignmentId/listening-tracks/:trackId") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  remove(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("trackId", ParseUUIDPipe) trackId: string) { return this.listening.deleteTrack(request.user.sub, assignmentId, trackId); }
  @Post("assignments/:assignmentId/listening-tracks/reorder") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  reorder(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Body(validate(ListeningTrackReorderDto)) body: ListeningTrackReorderDto) { return this.listening.reorderTracks(request.user.sub, assignmentId, body.ids); }
  @Post("assignments/:assignmentId/listening-tracks/:trackId/audio") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard) @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("trackId", ParseUUIDPipe) trackId: string, @UploadedFile() file: AudioUploadFile | undefined) { return this.listening.uploadAudio(request.user.sub, assignmentId, trackId, file); }
  @Delete("assignments/:assignmentId/listening-tracks/:trackId/audio") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  removeAudio(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("trackId", ParseUUIDPipe) trackId: string) { return this.listening.removeAudio(request.user.sub, assignmentId, trackId); }
  @Get("assignments/:assignmentId/listening-tracks/:trackId/audio") @StrictRoles("TEACHER") @UseGuards(ApprovedTeacherGuard)
  async teacherAudio(@Req() request: AuthenticatedRequest, @Param("assignmentId", ParseUUIDPipe) assignmentId: string, @Param("trackId", ParseUUIDPipe) trackId: string, @Res({ passthrough: true }) response: Response) { return stream(response, await this.listening.teacherAudio(request.user.sub, assignmentId, trackId)); }

  @Post("student/assignment-attempts/:attemptId/listening-tracks/:trackId/play") @StrictRoles("STUDENT")
  async play(@Req() request: AuthenticatedRequest, @Param("attemptId", ParseUUIDPipe) attemptId: string, @Param("trackId", ParseUUIDPipe) trackId: string, @Res({ passthrough: true }) response: Response) { const file = await this.listening.play(request.user.sub, attemptId, trackId); response.setHeader("X-Listening-Play-Count", String(file.playCount)); response.setHeader("X-Listening-Max-Plays", file.maxPlayCount === null ? "unlimited" : String(file.maxPlayCount)); return stream(response, file); }
}
