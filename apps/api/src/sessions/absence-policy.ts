export const ABSENCE_MINIMUM_NOTICE_MS = 2 * 60 * 60 * 1000;

export function isAbsenceRequestLate(scheduledStart: Date, requestedAt: Date) {
  return scheduledStart.getTime() - requestedAt.getTime() < ABSENCE_MINIMUM_NOTICE_MS;
}
