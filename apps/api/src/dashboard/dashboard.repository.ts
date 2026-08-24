import type { TeacherAttendanceReport, TeacherOverview } from "./dashboard.types";

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
}
