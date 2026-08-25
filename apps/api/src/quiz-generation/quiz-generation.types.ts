import type { AssignmentQuestionType, AssignmentSection } from "../../../../generated/prisma/client";

export type VocabularyRecord = {
  word: string;
  meaning: string;
  example: string | null;
  lessonId: string;
  lessonTitle: string;
};

export type GeneratedQuestionKind = "EN_TO_VI_MCQ" | "VI_TO_EN_MCQ" | "CONTEXT_FILL" | "TRUE_FALSE" | "MATCHING";

export type GeneratedQuizQuestion = {
  kind: GeneratedQuestionKind;
  sourceWord: string;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
};

export type PersistedQuestionInput = {
  type: AssignmentQuestionType;
  section: AssignmentSection;
  prompt: string;
  explanation: string | null;
  points: number;
  required: boolean;
  config: Record<string, unknown>;
};

export type GenerationResult = {
  mode: "AI" | "LOCAL";
  model: string | null;
  questions: GeneratedQuizQuestion[];
};

export type SourceLesson = { id: string; title: string; vocabulary: string; scheduledStart: Date };

export type QuickQuizSource =
  | { mode: "RECENT"; recentLessons: 1 | 3 | 5 }
  | { mode: "SELECTED"; lessonIds: string[] };

export type QuickQuizSaveInput = {
  classroomId: string;
  title: string;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  showLeaderboard: boolean;
  sourceLessonIds: string[];
  sourceWordCount: number;
  generationMode: "AI" | "LOCAL";
  generationModel: string | null;
  questions: PersistedQuestionInput[];
};

export type QuickQuizRepositoryResult<T = unknown> =
  | { status: "OK"; value: T }
  | { status: "NOT_FOUND" | "INVALID" | "INVALID_STATE"; message?: string };
