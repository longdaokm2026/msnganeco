import { Injectable } from "@nestjs/common";
import { AssignmentAttemptStatus, AssignmentStatus, Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { attemptExpired } from "./attempt-timing";
import { ListeningRepository, type ListeningAudioInput, type ListeningResult, type ListeningTrackInput } from "./listening.repository";

const audioSelect = { id: true, fileName: true, fileType: true, fileSize: true, storageKey: true } satisfies Prisma.AssignmentAudioAttachmentSelect;
const trackSelect = { id: true, assignmentId: true, title: true, instructions: true, transcript: true, transcriptVisibility: true, maxPlayCount: true, allowSeeking: true, position: true, createdAt: true, updatedAt: true, audioAttachment: { select: audioSelect }, _count: { select: { questions: true } } } satisfies Prisma.AssignmentListeningTrackSelect;
const view = (track: Prisma.AssignmentListeningTrackGetPayload<{ select: typeof trackSelect }>) => ({ ...track, audioAttachment: track.audioAttachment ? { id: track.audioAttachment.id, fileName: track.audioAttachment.fileName, fileType: track.audioAttachment.fileType, fileSize: track.audioAttachment.fileSize, audioUrl: `/assignments/${track.assignmentId}/listening-tracks/${track.id}/audio` } : null, questionCount: track._count.questions, _count: undefined });

@Injectable()
export class PrismaListeningRepository extends ListeningRepository {
  private draft(tx: Prisma.TransactionClient, teacherId: string, assignmentId: string) { return tx.assignment.findFirst({ where: { id: assignmentId, status: AssignmentStatus.DRAFT, classroom: { teacherId } }, select: { id: true, classroomId: true } }); }

  async createTrack(teacherId: string, assignmentId: string, input: ListeningTrackInput): Promise<ListeningResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId); if (!assignment) return { status: "NOT_FOUND" };
      const aggregate = await tx.assignmentListeningTrack.aggregate({ where: { assignmentId }, _max: { position: true } });
      const track = await tx.assignmentListeningTrack.create({ data: { assignmentId, title: input.title.trim(), instructions: input.instructions?.trim() || null, transcript: input.transcript?.trim() || null, transcriptVisibility: input.transcriptVisibility, maxPlayCount: input.maxPlayCount ?? null, allowSeeking: input.allowSeeking, position: (aggregate._max.position ?? -1) + 1 }, select: trackSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_LISTENING_TRACK_CREATED", entityType: "AssignmentListeningTrack", entityId: track.id, metadata: { assignmentId, classroomId: assignment.classroomId } } });
      return { status: "OK", value: view(track) };
    });
  }

  async updateTrack(teacherId: string, assignmentId: string, trackId: string, input: ListeningTrackInput): Promise<ListeningResult> {
    return prisma.$transaction(async (tx) => {
      if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" };
      const existing = await tx.assignmentListeningTrack.findFirst({ where: { id: trackId, assignmentId }, select: { id: true } }); if (!existing) return { status: "NOT_FOUND" };
      const track = await tx.assignmentListeningTrack.update({ where: { id: trackId }, data: { title: input.title.trim(), instructions: input.instructions?.trim() || null, transcript: input.transcript?.trim() || null, transcriptVisibility: input.transcriptVisibility, maxPlayCount: input.maxPlayCount ?? null, allowSeeking: input.allowSeeking }, select: trackSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_LISTENING_TRACK_UPDATED", entityType: "AssignmentListeningTrack", entityId: trackId, metadata: { assignmentId } } });
      return { status: "OK", value: view(track) };
    });
  }

  async deleteTrack(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningResult<{ success: true; oldStorageKey: string | null }>> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId); if (!assignment) return { status: "NOT_FOUND" };
      const track = await tx.assignmentListeningTrack.findFirst({ where: { id: trackId, assignmentId }, select: { audioAttachment: { select: { storageKey: true } } } }); if (!track) return { status: "NOT_FOUND" };
      await tx.assignmentListeningTrack.delete({ where: { id: trackId } });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_LISTENING_TRACK_DELETED", entityType: "AssignmentListeningTrack", entityId: trackId, metadata: { assignmentId, classroomId: assignment.classroomId } } });
      return { status: "OK", value: { success: true, oldStorageKey: track.audioAttachment?.storageKey ?? null } };
    });
  }

  async reorderTracks(teacherId: string, assignmentId: string, ids: string[]): Promise<ListeningResult> {
    return prisma.$transaction(async (tx) => {
      if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" };
      const tracks = await tx.assignmentListeningTrack.findMany({ where: { assignmentId }, select: { id: true } });
      if (ids.length !== tracks.length || new Set(ids).size !== ids.length || ids.some((id) => !tracks.some((track) => track.id === id))) return { status: "INVALID", message: "Danh sách sắp xếp Listening không đầy đủ." };
      for (const [position, id] of ids.entries()) await tx.assignmentListeningTrack.update({ where: { id }, data: { position: -1000 - position } });
      for (const [position, id] of ids.entries()) await tx.assignmentListeningTrack.update({ where: { id }, data: { position } });
      return { status: "OK", value: { success: true } };
    });
  }

  async saveAudio(teacherId: string, assignmentId: string, trackId: string, input: ListeningAudioInput): Promise<ListeningResult<{ track: unknown; oldStorageKey: string | null }>> {
    return prisma.$transaction(async (tx) => {
      if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" };
      const track = await tx.assignmentListeningTrack.findFirst({ where: { id: trackId, assignmentId }, select: { audioAttachment: { select: audioSelect } } }); if (!track) return { status: "NOT_FOUND" };
      const oldStorageKey = track.audioAttachment?.storageKey ?? null;
      if (track.audioAttachment) await tx.assignmentAudioAttachment.delete({ where: { id: track.audioAttachment.id } });
      await tx.assignmentAudioAttachment.create({ data: { listeningTrackId: trackId, uploadedById: teacherId, fileName: input.fileName, fileType: input.fileType, fileSize: input.fileSize, storageKey: input.storageKey } });
      const refreshed = await tx.assignmentListeningTrack.findUniqueOrThrow({ where: { id: trackId }, select: trackSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_LISTENING_AUDIO_UPLOADED", entityType: "AssignmentListeningTrack", entityId: trackId, metadata: { assignmentId, fileSize: input.fileSize, fileType: input.fileType } } });
      return { status: "OK", value: { track: view(refreshed), oldStorageKey } };
    });
  }

  async removeAudio(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningResult<{ success: true; oldStorageKey: string | null }>> {
    return prisma.$transaction(async (tx) => {
      if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" };
      const track = await tx.assignmentListeningTrack.findFirst({ where: { id: trackId, assignmentId }, select: { audioAttachment: { select: audioSelect } } }); if (!track) return { status: "NOT_FOUND" };
      if (track.audioAttachment) await tx.assignmentAudioAttachment.delete({ where: { id: track.audioAttachment.id } });
      return { status: "OK", value: { success: true, oldStorageKey: track.audioAttachment?.storageKey ?? null } };
    });
  }

  async teacherAudio(teacherId: string, assignmentId: string, trackId: string) {
    const track = await prisma.assignmentListeningTrack.findFirst({ where: { id: trackId, assignmentId, assignment: { classroom: { teacherId } } }, select: { audioAttachment: { select: audioSelect } } });
    return track?.audioAttachment ? { storageKey: track.audioAttachment.storageKey, fileName: track.audioAttachment.fileName, fileType: track.audioAttachment.fileType } : null;
  }

  async play(studentId: string, attemptId: string, trackId: string): Promise<ListeningResult<{ storageKey: string; fileName: string; fileType: string; playCount: number; maxPlayCount: number | null }>> {
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.assignmentAttempt.findFirst({ where: { id: attemptId, studentId }, select: { id: true, status: true, startedAt: true, assignmentId: true, assignment: { select: { timeLimitMinutes: true } } } }); if (!attempt) return { status: "NOT_FOUND" };
      const track = await tx.assignmentListeningTrack.findFirst({ where: { id: trackId, assignmentId: attempt.assignmentId }, select: { maxPlayCount: true, audioAttachment: { select: audioSelect } } }); if (!track?.audioAttachment) return { status: "NOT_FOUND", message: "Chưa có file Listening." };
      const currentCount = await tx.assignmentListeningPlayback.count({ where: { attemptId, trackId } });
      if (attempt.status === AssignmentAttemptStatus.IN_PROGRESS) {
        if (attemptExpired(attempt.startedAt, attempt.assignment.timeLimitMinutes)) return { status: "INVALID_STATE", message: "Đã hết thời gian làm bài." };
        if (track.maxPlayCount !== null && currentCount >= track.maxPlayCount) return { status: "LIMIT", message: "Bạn đã sử dụng hết số lượt nghe." };
        await tx.assignmentListeningPlayback.create({ data: { attemptId, trackId, studentId } });
      }
      const playCount = attempt.status === AssignmentAttemptStatus.IN_PROGRESS ? currentCount + 1 : currentCount;
      return { status: "OK", value: { storageKey: track.audioAttachment.storageKey, fileName: track.audioAttachment.fileName, fileType: track.audioAttachment.fileType, playCount, maxPlayCount: track.maxPlayCount } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
