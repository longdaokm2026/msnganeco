import type { AssignmentQuestionType, AssignmentSection, AssignmentType, WritingTaskType } from "../../../../generated/prisma/client";

export type DocumentQuestion = {
  type: AssignmentQuestionType; section: AssignmentSection; prompt: string;
  explanation: string | null; points: number; config: Record<string, unknown>;
  passageNumber: number | null;
};
export type DocumentPassage = { number: number; title: string | null; content: string };
export type DocumentWriting = { type: WritingTaskType; prompt: string | null; minWords: number | null; translationItems: string[] };
export type DocumentAssignment = {
  title: string; description: string | null; type: AssignmentType;
  maxAttempts: number | null; timeLimitMinutes: number | null;
  questions: DocumentQuestion[]; passages: DocumentPassage[]; writing: DocumentWriting | null;
};
export type ImportPreview = DocumentAssignment & { warnings: string[]; totalPoints: number };
