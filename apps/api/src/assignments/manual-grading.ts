import { AssignmentAttemptStatus } from "../../../../generated/prisma/client";

export function calculateAssignmentOutcome(input: { automaticScore: number; automaticMaxScore: number; manualMaxScore?: number; manualScore?: number | null }) {
  const manualMaxScore = input.manualMaxScore ?? 0;
  const maxScore = input.automaticMaxScore + manualMaxScore;
  if (manualMaxScore > 0 && (input.manualScore === undefined || input.manualScore === null)) return { status: AssignmentAttemptStatus.PENDING_MANUAL_GRADE, score: input.automaticScore, maxScore, percentage: null };
  const score = input.automaticScore + (input.manualScore ?? 0);
  return { status: manualMaxScore > 0 ? AssignmentAttemptStatus.FULLY_GRADED : AssignmentAttemptStatus.AUTO_GRADED, score, maxScore, percentage: maxScore ? score / maxScore * 100 : 0 };
}

export function missingRequiredReadAloud(task: unknown, submission: unknown) { return Boolean(task && !submission); }

export function assignmentPublishError(input: { title: string; questionCount: number; readAloudTask?: { readingText: string; maxScore: number } | null }) {
  if (!input.title.trim() || (!input.questionCount && !input.readAloudTask)) return "Cần có tiêu đề và ít nhất một câu hỏi hoặc bài đọc ghi âm trước khi xuất bản.";
  if (input.readAloudTask && (!input.readAloudTask.readingText.trim() || input.readAloudTask.maxScore <= 0)) return "Cần nhập nội dung bài đọc và điểm tối đa hợp lệ trước khi xuất bản.";
  return null;
}
