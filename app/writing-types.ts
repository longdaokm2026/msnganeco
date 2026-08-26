export type WritingTaskType = "ESSAY" | "TRANSLATION_VI_EN" | "TRANSLATION_EN_VI";
export type TranslationItem = { id: string; position: number; sourceText: string; referenceAnswer?: string | null };
export type WritingTask = { id: string; type: WritingTaskType; title: string | null; prompt: string | null; instructions: string | null; minWords: number | null; maxWords: number | null; maxScore: number; translationItems: TranslationItem[] };
export type TranslationAnswer = { id: string; translationItemId: string; answerText: string; isCorrect: boolean | null; teacherComment: string | null };
export type TranslationResult = { gradedCount: number; correctCount: number; totalItems: number; complete: boolean; percentage: number | null };
export type WritingSubmission = { id: string; essayContent: string | null; wordCount: number | null; submittedAt: string | null; essayScore: number | null; teacherFeedback: string | null; gradedAt: string | null; translationAnswers: TranslationAnswer[]; translationResult: TranslationResult | null };

export const writingTypeLabels: Record<WritingTaskType, string> = {
  ESSAY: "Essay",
  TRANSLATION_VI_EN: "Dịch Việt → Anh",
  TRANSLATION_EN_VI: "Dịch Anh → Việt",
};
