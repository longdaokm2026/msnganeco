import type { ObjectiveResult } from "../assignments/result-view";

export type LeaderboardAttempt = {
  id: string;
  attemptNumber: number;
  startedAt: Date;
  submittedAt: Date;
  student: { id: string; fullName: string };
  answers: { isCorrect: boolean | null }[];
};

export type LeaderboardEntry = ObjectiveResult & {
  rank: number;
  student: { id: string; fullName: string };
  durationMs: number;
  attemptNumber: number;
  submittedAt: Date;
};

const correct = (attempt: LeaderboardAttempt) => attempt.answers.filter((answer) => answer.isCorrect === true).length;
const duration = (attempt: LeaderboardAttempt) => Math.max(0, attempt.submittedAt.getTime() - attempt.startedAt.getTime());

export function rankLeaderboard(attempts: LeaderboardAttempt[], totalQuestions: number): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardAttempt>();
  const compare = (left: LeaderboardAttempt, right: LeaderboardAttempt) => correct(right) - correct(left) || duration(left) - duration(right) || left.submittedAt.getTime() - right.submittedAt.getTime();
  for (const attempt of attempts) {
    const current = best.get(attempt.student.id);
    if (!current || compare(attempt, current) < 0) best.set(attempt.student.id, attempt);
  }
  return [...best.values()].sort(compare).map((attempt, index) => {
    const correctCount = correct(attempt);
    return { rank: index + 1, student: attempt.student, correctCount, totalQuestions, percentage: totalQuestions ? correctCount / totalQuestions * 100 : 0, durationMs: duration(attempt), attemptNumber: attempt.attemptNumber, submittedAt: attempt.submittedAt };
  });
}

