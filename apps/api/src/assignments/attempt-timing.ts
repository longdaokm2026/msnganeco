export function attemptExpired(startedAt: Date, timeLimitMinutes: number | null, now = new Date()) {
  return Boolean(timeLimitMinutes && now.getTime() > startedAt.getTime() + timeLimitMinutes * 60_000);
}

export function attemptDurationMs(startedAt: Date, submittedAt: Date) {
  return Math.max(0, submittedAt.getTime() - startedAt.getTime());
}
