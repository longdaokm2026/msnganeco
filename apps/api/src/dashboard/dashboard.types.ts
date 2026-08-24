export interface TeacherClassOverview {
  id: string;
  code: string;
  name: string;
  studentCount: number;
  sessionCount: number;
  nextSession: { title: string; scheduledStart: string } | null;
}

export interface TeacherOverview {
  activeClassCount: number;
  activeStudentCount: number;
  todaySessionCount: number;
  pendingAbsenceCount: number;
  nextSession: { className: string; title: string; scheduledStart: string } | null;
  classes: TeacherClassOverview[];
}

export interface TeacherAttendanceStudentRow {
  classroomId: string;
  classroomName: string;
  studentId: string;
  studentCode: string | null;
  fullName: string;
  completedSessions: number;
  present: number;
  late: number;
  absent: number;
  approvedAbsence: number;
  rejectedAbsence: number;
  pendingAbsence: number;
  billableSessions: number;
}

export interface TeacherAttendanceReport {
  month: string;
  totals: Omit<TeacherAttendanceStudentRow, "classroomId" | "classroomName" | "studentId" | "studentCode" | "fullName">;
  students: TeacherAttendanceStudentRow[];
}
