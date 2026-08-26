import type { WritingTaskType } from "../../../../generated/prisma/client";

export const WRITING_MAX_SCORE = 10;
export type WritingTaskInput = { type: WritingTaskType; title?: string | null; prompt?: string | null; instructions?: string | null; minWords?: number | null; maxWords?: number | null };
export type TranslationItemInput = { sourceText: string; referenceAnswer?: string | null };
export type WritingResult<T = unknown> = { status: "OK"; value: T } | { status: "NOT_FOUND" | "INVALID" | "INVALID_STATE" | "FORBIDDEN"; message?: string };

export abstract class WritingRepository {
  abstract upsertTask(teacherId: string, assignmentId: string, input: WritingTaskInput): Promise<WritingResult>;
  abstract deleteTask(teacherId: string, assignmentId: string): Promise<WritingResult>;
  abstract addTranslationItem(teacherId: string, assignmentId: string, input: TranslationItemInput): Promise<WritingResult>;
  abstract updateTranslationItem(teacherId: string, assignmentId: string, itemId: string, input: TranslationItemInput): Promise<WritingResult>;
  abstract deleteTranslationItem(teacherId: string, assignmentId: string, itemId: string): Promise<WritingResult>;
  abstract reorderTranslationItems(teacherId: string, assignmentId: string, ids: string[]): Promise<WritingResult>;
  abstract studentTask(studentId: string, assignmentId: string): Promise<WritingResult>;
  abstract studentAttempt(studentId: string, attemptId: string): Promise<WritingResult>;
  abstract saveEssay(studentId: string, attemptId: string, content: string): Promise<WritingResult>;
  abstract saveTranslation(studentId: string, attemptId: string, itemId: string, answerText: string): Promise<WritingResult>;
  abstract gradeEssay(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null): Promise<WritingResult>;
  abstract gradeTranslation(teacherId: string, assignmentId: string, submissionId: string, answerId: string, isCorrect: boolean, teacherComment?: string | null): Promise<WritingResult>;
  abstract saveFeedback(teacherId: string, assignmentId: string, submissionId: string, feedback?: string | null): Promise<WritingResult>;
}
