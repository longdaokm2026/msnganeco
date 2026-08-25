import type { Role } from "../../../../generated/prisma/client";

export const READ_ALOUD_MAX_SCORE = 10;

export type ReadAloudTaskInput = { title?: string | null; readingText: string; instructions?: string | null; maxScore?: number; maxDurationSeconds?: number | null };
export type ReadAloudAudioInput = { fileName: string; fileType: string; fileSize: number; storageKey: string; durationSeconds?: number | null };
export type ReadAloudResult<T = unknown> = { status: "OK"; value: T } | { status: "NOT_FOUND" | "INVALID" | "INVALID_STATE" | "FORBIDDEN"; message?: string };
export type ReadAloudAudioRecord = { storageKey: string; fileName: string; fileType: string };

export abstract class ReadAloudRepository {
  abstract upsertTask(teacherId: string, assignmentId: string, input: ReadAloudTaskInput): Promise<ReadAloudResult>;
  abstract deleteTask(teacherId: string, assignmentId: string): Promise<ReadAloudResult>;
  abstract studentTask(studentId: string, assignmentId: string): Promise<ReadAloudResult>;
  abstract saveUpload(studentId: string, attemptId: string, input: ReadAloudAudioInput): Promise<ReadAloudResult<{ submission: unknown; oldStorageKey: string | null }>>;
  abstract audio(userId: string, roles: Role[], submissionId: string): Promise<ReadAloudAudioRecord | null>;
  abstract audioForAttempt(studentId: string, attemptId: string): Promise<ReadAloudAudioRecord | null>;
  abstract results(teacherId: string, assignmentId: string): Promise<ReadAloudResult>;
  abstract grade(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null): Promise<ReadAloudResult>;
}
