import type { ListeningTranscriptVisibility } from "../../../../generated/prisma/client";

export type ListeningTrackInput = { title: string; instructions?: string | null; transcript?: string | null; transcriptVisibility: ListeningTranscriptVisibility; maxPlayCount?: number | null; allowSeeking: boolean };
export type ListeningAudioInput = { fileName: string; fileType: string; fileSize: number; storageKey: string };
export type ListeningAudioRecord = { storageKey: string; fileName: string; fileType: string; playCount?: number; maxPlayCount?: number | null };
export type ListeningResult<T = unknown> = { status: "OK"; value: T } | { status: "NOT_FOUND" | "INVALID" | "INVALID_STATE" | "FORBIDDEN" | "LIMIT"; message?: string };

export abstract class ListeningRepository {
  abstract createTrack(teacherId: string, assignmentId: string, input: ListeningTrackInput): Promise<ListeningResult>;
  abstract updateTrack(teacherId: string, assignmentId: string, trackId: string, input: ListeningTrackInput): Promise<ListeningResult>;
  abstract deleteTrack(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningResult<{ success: true; oldStorageKey: string | null }>>;
  abstract reorderTracks(teacherId: string, assignmentId: string, ids: string[]): Promise<ListeningResult>;
  abstract saveAudio(teacherId: string, assignmentId: string, trackId: string, input: ListeningAudioInput): Promise<ListeningResult<{ track: unknown; oldStorageKey: string | null }>>;
  abstract removeAudio(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningResult<{ success: true; oldStorageKey: string | null }>>;
  abstract teacherAudio(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningAudioRecord | null>;
  abstract play(studentId: string, attemptId: string, trackId: string): Promise<ListeningResult<ListeningAudioRecord>>;
}
