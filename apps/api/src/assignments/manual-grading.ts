export function missingRequiredReadAloud(task: unknown, submission: unknown) { return Boolean(task && !submission); }

export function manualGradeComplete(input: { hasReadAloud: boolean; readAloudScore: number | null; writingType: "ESSAY" | "TRANSLATION_VI_EN" | "TRANSLATION_EN_VI" | null; essayScore: number | null; translationItemCount: number; translationGrades: (boolean | null)[] }) {
  if (input.hasReadAloud && input.readAloudScore === null) return false;
  if (input.writingType === "ESSAY" && input.essayScore === null) return false;
  if (input.writingType && input.writingType !== "ESSAY" && (input.translationItemCount === 0 || input.translationGrades.length !== input.translationItemCount || input.translationGrades.some((value) => value === null))) return false;
  return true;
}

export function assignmentPublishError(input: { title: string; questionCount: number; listeningTracks?: { hasAudio: boolean; questionCount: number }[]; readAloudTask?: { readingText: string; maxScore: number } | null; writingTask?: { type: "ESSAY" | "TRANSLATION_VI_EN" | "TRANSLATION_EN_VI"; prompt: string | null; translationItemCount: number } | null }) {
  if (!input.title.trim() || (!input.questionCount && !input.readAloudTask && !input.writingTask)) return "Cần có tiêu đề và ít nhất một câu hỏi, Listening, Speaking hoặc Writing trước khi xuất bản.";
  if (input.listeningTracks?.some((track) => !track.hasAudio)) return "Mỗi đoạn Listening cần có file âm thanh trước khi xuất bản.";
  if (input.listeningTracks?.some((track) => track.questionCount < 1)) return "Mỗi đoạn Listening cần có ít nhất một câu hỏi trước khi xuất bản.";
  if (input.readAloudTask && (!input.readAloudTask.readingText.trim() || input.readAloudTask.maxScore <= 0)) return "Cần nhập nội dung bài đọc và điểm tối đa hợp lệ trước khi xuất bản.";
  if (input.writingTask?.type === "ESSAY" && !input.writingTask.prompt?.trim()) return "Cần nhập đề bài Essay trước khi xuất bản.";
  if (input.writingTask && input.writingTask.type !== "ESSAY" && input.writingTask.translationItemCount < 1) return "Cần thêm ít nhất một câu dịch trước khi xuất bản.";
  return null;
}
