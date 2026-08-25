export function missingRequiredReadAloud(task: unknown, submission: unknown) { return Boolean(task && !submission); }

export function assignmentPublishError(input: { title: string; questionCount: number; readAloudTask?: { readingText: string; maxScore: number } | null }) {
  if (!input.title.trim() || (!input.questionCount && !input.readAloudTask)) return "Cần có tiêu đề và ít nhất một câu hỏi hoặc bài đọc ghi âm trước khi xuất bản.";
  if (input.readAloudTask && (!input.readAloudTask.readingText.trim() || input.readAloudTask.maxScore <= 0)) return "Cần nhập nội dung bài đọc và điểm tối đa hợp lệ trước khi xuất bản.";
  return null;
}
