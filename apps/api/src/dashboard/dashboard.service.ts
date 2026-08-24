import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "../../../../generated/prisma/client";
import type { AccessTokenPayload } from "../auth/auth.types";
import { DashboardRepository } from "./dashboard.repository";

const rolePriority: Role[] = ["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"];

const dashboardByRole = {
  ADMIN: {
    roleLabel: "Quản trị viên",
    title: "Tổng quan vận hành",
    description: "Theo dõi tài khoản, giáo viên và hoạt động toàn hệ thống.",
    metrics: [
      { label: "Tài khoản", value: "—", hint: "Sẽ kết nối dữ liệu ở giai đoạn quản trị" },
      { label: "Giáo viên", value: "—", hint: "Chờ duyệt và đang hoạt động" },
      { label: "Lớp học", value: "—", hint: "Toàn bộ lớp trên hệ thống" },
    ],
    actions: ["Quản lý tài khoản", "Duyệt giáo viên", "Xem nhật ký hệ thống"],
  },
  TEACHER: {
    roleLabel: "Giáo viên",
    title: "Không gian giảng dạy",
    description: "Chuẩn bị lớp, bài học và theo dõi tiến độ học sinh.",
    metrics: [
      { label: "Lớp đang dạy", value: "0", hint: "Chưa có lớp đang hoạt động" },
      { label: "Buổi học hôm nay", value: "0", hint: "Chưa có lịch học" },
      { label: "Đơn xin vắng", value: "0", hint: "Không có đơn chờ duyệt" },
    ],
    actions: ["Quản lý lớp học", "Quản lý bài học", "Tạo bài tập"],
  },
  STUDENT: {
    roleLabel: "Học sinh",
    title: "Hành trình học tập",
    description: "Theo dõi lớp học, bài tập và kết quả của bạn.",
    metrics: [
      { label: "Lớp đang học", value: "0", hint: "Chờ giáo viên thêm vào lớp" },
      { label: "Buổi học hôm nay", value: "0", hint: "Chưa có lịch học" },
      { label: "Chuyên cần", value: "—", hint: "Chưa có dữ liệu điểm danh" },
    ],
    actions: ["Buổi học & chuyên cần", "Bài học", "Quản lý phụ huynh", "Làm bài tập"],
  },
  GUARDIAN: {
    roleLabel: "Phụ huynh",
    title: "Theo dõi việc học",
    description: "Nắm lịch học, chuyên cần và kết quả của học sinh.",
    metrics: [
      { label: "Học sinh liên kết", value: "0", hint: "Chưa có học sinh được liên kết" },
      { label: "Buổi học tuần này", value: "0", hint: "Chưa có lịch học" },
      { label: "Thông báo mới", value: "0", hint: "Không có thông báo mới" },
    ],
    actions: ["Liên kết học sinh", "Xem chuyên cần", "Xem kết quả"],
  },
} satisfies Record<Role, {
  roleLabel: string;
  title: string;
  description: string;
  metrics: { label: string; value: string; hint: string }[];
  actions: string[];
}>;

@Injectable()
export class DashboardService {
  constructor(@Inject(DashboardRepository) private readonly repository: DashboardRepository) {}

  async overview(user: AccessTokenPayload) {
    const primaryRole = rolePriority.find((role) => user.roles.includes(role)) ?? "STUDENT";
    if (primaryRole === "TEACHER") {
      const now = new Date();
      const { from, to } = vietnamDayRange(now);
      const teacherOverview = await this.repository.teacherOverview(user.sub, now, from, to);
      const nextSessionHint = teacherOverview.nextSession
        ? `${teacherOverview.nextSession.className} · ${formatVietnamDateTime(teacherOverview.nextSession.scheduledStart)}`
        : "Chưa có lịch học sắp tới";
      return {
        primaryRole,
        ...dashboardByRole.TEACHER,
        metrics: [
          {
            label: "Lớp đang dạy",
            value: String(teacherOverview.activeClassCount),
            hint: `${teacherOverview.activeStudentCount} học sinh đang học`,
          },
          {
            label: "Buổi học hôm nay",
            value: String(teacherOverview.todaySessionCount),
            hint: nextSessionHint,
          },
          {
            label: "Đơn xin vắng",
            value: String(teacherOverview.pendingAbsenceCount),
            hint: teacherOverview.pendingAbsenceCount ? "Đang chờ giáo viên duyệt" : "Không có đơn chờ duyệt",
          },
        ],
        teacherOverview,
      };
    }
    if (primaryRole === "STUDENT") {
      const now = new Date();
      const month = vietnamMonth(now);
      const dayRange = vietnamDayRange(now);
      const monthRange = vietnamMonthRange(month);
      const studentOverview = await this.repository.studentOverview(
        user.sub,
        now,
        dayRange.from,
        dayRange.to,
        month,
        monthRange.from,
        monthRange.to,
      );
      const nextSessionHint = studentOverview.nextSession
        ? `${studentOverview.nextSession.classroomName} · ${formatVietnamDateTime(studentOverview.nextSession.scheduledStart)}`
        : "Chưa có lịch học sắp tới";
      const rate = studentOverview.monthAttendance.attendanceRate;
      return {
        primaryRole,
        ...dashboardByRole.STUDENT,
        metrics: [
          {
            label: "Lớp đang học",
            value: String(studentOverview.activeClassCount),
            hint: studentOverview.activeClassCount ? "Lớp đang tham gia" : "Chờ giáo viên thêm vào lớp",
          },
          {
            label: "Buổi học hôm nay",
            value: String(studentOverview.todaySessionCount),
            hint: nextSessionHint,
          },
          {
            label: "Chuyên cần tháng này",
            value: rate === null ? "—" : `${rate}%`,
            hint: `${studentOverview.monthAttendance.total} buổi đã điểm danh · ${studentOverview.pendingAbsenceCount} đơn chờ duyệt`,
          },
        ],
        studentOverview,
      };
    }
    return { primaryRole, ...dashboardByRole[primaryRole] };
  }

  teacherAttendance(teacherId: string, requestedMonth?: string) {
    const month = requestedMonth ?? vietnamMonth(new Date());
    const { from, to } = vietnamMonthRange(month);
    return this.repository.teacherAttendanceReport(teacherId, month, from, to);
  }

  studentAttendance(studentId: string, requestedMonth?: string) {
    const month = requestedMonth ?? vietnamMonth(new Date());
    const { from, to } = vietnamMonthRange(month);
    return this.repository.studentAttendanceReport(studentId, month, from, to);
  }

  teachingAccess() {
    return { allowed: true, area: "teaching" };
  }

  learningAccess() {
    return { allowed: true, area: "learning" };
  }

  guardianAccess() {
    return { allowed: true, area: "guardian" };
  }

  administrationAccess() {
    return { allowed: true, area: "administration" };
  }
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function vietnamMonth(date: Date) {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function vietnamDayRange(date: Date) {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  const from = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - VIETNAM_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

function vietnamMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, monthNumber - 1, 1) - VIETNAM_OFFSET_MS),
    to: new Date(Date.UTC(year, monthNumber, 1) - VIETNAM_OFFSET_MS),
  };
}

function formatVietnamDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
