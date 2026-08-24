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

export interface StudentAttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRate: number | null;
}

export interface StudentOverview {
  activeClassCount: number;
  todaySessionCount: number;
  pendingAbsenceCount: number;
  nextSession: { classroomName: string; title: string; scheduledStart: string } | null;
  month: string;
  monthAttendance: StudentAttendanceSummary;
  classes: {
    id: string;
    code: string;
    name: string;
    scheduleNote: string | null;
    nextSession: { title: string; scheduledStart: string } | null;
  }[];
}

export interface StudentAttendanceReport {
  month: string;
  totals: StudentAttendanceSummary;
  classes: Array<StudentAttendanceSummary & {
    classroomId: string;
    classroomName: string;
  }>;
}
