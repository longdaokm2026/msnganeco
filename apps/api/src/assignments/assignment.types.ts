import type { AssignmentQuestionType, AssignmentSection, AssignmentStatus, AssignmentType } from "../../../../generated/prisma/client";

export type AssignmentInput = {
  classroomId: string; lessonId?: string | null; title: string; description?: string | null;
  type: AssignmentType; dueAt?: string | null; allowLateSubmission: boolean; maxAttempts: number;
  timeLimitMinutes?: number | null; showScoreImmediately: boolean; showAnswersAfterSubmit?: boolean; showLeaderboard?: boolean;
};
export type AssignmentPatch = Partial<Omit<AssignmentInput, "classroomId">> & { classroomId?: string };
export type AssignmentListQuery = { classroomId?: string; lessonId?: string; type?: AssignmentType; status?: AssignmentStatus; page: number; pageSize: number };
export type QuestionInput = { type: AssignmentQuestionType; section: AssignmentSection; passageId?: string | null; listeningTrackId?: string | null; prompt: string; explanation?: string | null; points: number; required: boolean; config: Record<string, unknown> };
export type PassageInput = { title?: string | null; content: string };
export type ReorderInput = { ids: string[] };
export type AnswerInput = { answer: unknown };
export type RepositoryResult<T = unknown> = { status: "OK"; value: T } | { status: "NOT_FOUND" | "INVALID_STATE" | "INVALID" | "FORBIDDEN" | "LIMIT" | "DUE"; message?: string };
