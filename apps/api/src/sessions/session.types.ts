export type AttendanceValue = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type AbsenceValue = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface CreateSessionInput {
  title: string;
  topic?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface SessionSummary {
  id: string;
  classroomId: string;
  classroomName: string;
  title: string;
  topic: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
}

export interface AttendanceRow {
  studentId: string;
  fullName: string;
  email: string;
  studentCode: string | null;
  attendanceStatus: AttendanceValue | null;
  attendanceNote: string | null;
  absenceRequest: {
    id: string;
    reason: string;
    status: AbsenceValue;
    reviewNote: string | null;
  } | null;
}

export interface StudentSession extends SessionSummary {
  attendanceStatus: AttendanceValue | null;
  absenceRequest: { id: string; reason: string; status: AbsenceValue } | null;
}

export type OwnedResult<T> = { status: "OK"; value: T } | { status: "NOT_FOUND" };
export type CreateSessionResult = OwnedResult<SessionSummary> | { status: "DUPLICATE" };
export type MarkAttendanceResult = "OK" | "NOT_FOUND" | "INVALID_STUDENT";
export type AbsenceRequestResult =
  | { status: "OK"; requestId: string }
  | { status: "NOT_FOUND" | "NOT_ENROLLED" | "DEADLINE_PASSED" | "ALREADY_REQUESTED" };
export type ReviewAbsenceResult = "OK" | "NOT_FOUND" | "ALREADY_REVIEWED";
