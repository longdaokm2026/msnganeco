export type LinkStatus = "PENDING" | "ACTIVE" | "REJECTED" | "REVOKED";

export interface GuardianStudentLink {
  studentId: string;
  fullName: string;
  email: string;
  studentCode: string | null;
  relationship: string;
  status: LinkStatus;
  isPrimaryContact: boolean;
  requestedAt: string;
  respondedAt: string | null;
}

export interface StudentGuardianLink {
  guardianId: string;
  fullName: string;
  email: string;
  phone: string | null;
  relationship: string;
  status: LinkStatus;
  isPrimaryContact: boolean;
  requestedAt: string;
  respondedAt: string | null;
}

export interface GuardianStudentOverview {
  student: {
    id: string;
    fullName: string;
    email: string;
    studentCode: string | null;
    schoolName: string | null;
  };
  classes: {
    id: string;
    code: string;
    name: string;
    level: string | null;
    teacherName: string;
    scheduleNote: string | null;
  }[];
  attendanceSummary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendanceRate: number | null;
  };
  upcomingSessions: {
    id: string;
    classroomName: string;
    title: string;
    topic: string | null;
    scheduledStart: string;
    scheduledEnd: string;
  }[];
  recentAttendance: {
    sessionId: string;
    classroomName: string;
    sessionTitle: string;
    scheduledStart: string;
    status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    note: string | null;
  }[];
}

export type RequestLinkResult =
  | { status: "CREATED"; value: GuardianStudentLink }
  | { status: "STUDENT_NOT_FOUND" | "ALREADY_PENDING" | "ALREADY_ACTIVE" | "SAME_USER" };

export type ReviewLinkResult = "OK" | "NOT_FOUND" | "NOT_PENDING";
export type RevokeLinkResult = "OK" | "NOT_FOUND";
export type OverviewResult =
  | { status: "OK"; value: GuardianStudentOverview }
  | { status: "NOT_FOUND" };
