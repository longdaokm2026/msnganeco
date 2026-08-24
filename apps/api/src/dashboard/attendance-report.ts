import type { AbsenceValue, AttendanceValue } from "../sessions/session.types";

export type AttendanceReportSession = {
  attendanceStatus: AttendanceValue | null;
  absenceStatus: AbsenceValue | null;
};

export function summarizeStudentAttendance(sessions: AttendanceReportSession[]) {
  const result = {
    completedSessions: sessions.length,
    present: 0,
    late: 0,
    absent: 0,
    approvedAbsence: 0,
    rejectedAbsence: 0,
    pendingAbsence: 0,
    billableSessions: 0,
  };

  for (const session of sessions) {
    if (session.attendanceStatus === "PRESENT") result.present += 1;
    if (session.attendanceStatus === "LATE") result.late += 1;
    if (session.attendanceStatus === "ABSENT") result.absent += 1;
    if (session.absenceStatus === "APPROVED") result.approvedAbsence += 1;
    if (session.absenceStatus === "REJECTED") result.rejectedAbsence += 1;
    if (session.absenceStatus === "PENDING") result.pendingAbsence += 1;

    const isApprovedExcused = session.absenceStatus === "APPROVED"
      && session.attendanceStatus === "EXCUSED";
    if (!isApprovedExcused) result.billableSessions += 1;
  }
  return result;
}
