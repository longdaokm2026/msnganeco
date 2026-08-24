import type {
  StudentAttendanceReport,
  StudentOverview,
  TeacherAttendanceReport,
  TeacherOverview,
} from "./dashboard.types";

export abstract class DashboardRepository {
  abstract teacherOverview(
    teacherId: string,
    now: Date,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<TeacherOverview>;

  abstract teacherAttendanceReport(
    teacherId: string,
    month: string,
    from: Date,
    to: Date,
  ): Promise<TeacherAttendanceReport>;

  abstract studentOverview(
    studentId: string,
    now: Date,
    todayStart: Date,
    todayEnd: Date,
    month: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<StudentOverview>;

  abstract studentAttendanceReport(
    studentId: string,
    month: string,
    from: Date,
    to: Date,
  ): Promise<StudentAttendanceReport>;
}
