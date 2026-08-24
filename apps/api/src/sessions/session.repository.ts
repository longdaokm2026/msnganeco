import type {
  AbsenceRequestResult,
  AttendanceRow,
  CreateSessionInput,
  CreateSessionResult,
  MarkAttendanceResult,
  OwnedResult,
  ReviewAbsenceResult,
  SessionSummary,
  StudentSession,
} from "./session.types";

export abstract class SessionRepository {
  abstract createSession(
    teacherId: string,
    classroomId: string,
    input: CreateSessionInput,
  ): Promise<CreateSessionResult>;
  abstract listClassSessions(
    teacherId: string,
    classroomId: string,
  ): Promise<OwnedResult<SessionSummary[]>>;
  abstract attendanceSheet(
    teacherId: string,
    sessionId: string,
  ): Promise<OwnedResult<{ session: SessionSummary; rows: AttendanceRow[] }>>;
  abstract markAttendance(
    teacherId: string,
    sessionId: string,
    records: { studentId: string; status: string; note?: string }[],
  ): Promise<MarkAttendanceResult>;
  abstract listStudentSessions(studentId: string, now: Date): Promise<StudentSession[]>;
  abstract requestAbsence(
    studentId: string,
    sessionId: string,
    reason: string,
    now: Date,
  ): Promise<AbsenceRequestResult>;
  abstract reviewAbsence(
    teacherId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    note: string | undefined,
    now: Date,
  ): Promise<ReviewAbsenceResult>;
}
