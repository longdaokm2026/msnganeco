import { Injectable } from "@nestjs/common";
import type { Role } from "../../../../generated/prisma/client";
import type { AccessTokenPayload } from "../auth/auth.types";

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
      { label: "Lớp đang dạy", value: "0", hint: "Tạo lớp đầu tiên ở giai đoạn 2" },
      { label: "Buổi học hôm nay", value: "0", hint: "Chưa có lịch học" },
      { label: "Bài cần chấm", value: "0", hint: "Chưa có bài nộp mới" },
    ],
    actions: ["Tạo lớp học", "Soạn bài học", "Tạo bài tập"],
  },
  STUDENT: {
    roleLabel: "Học sinh",
    title: "Hành trình học tập",
    description: "Theo dõi lớp học, bài tập và kết quả của bạn.",
    metrics: [
      { label: "Lớp đang học", value: "0", hint: "Chờ giáo viên thêm vào lớp" },
      { label: "Bài tập cần làm", value: "0", hint: "Không có bài tập sắp hạn" },
      { label: "Chuyên cần", value: "—", hint: "Chưa có dữ liệu điểm danh" },
    ],
    actions: ["Xem lớp học", "Làm bài tập", "Xem kết quả"],
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
  overview(user: AccessTokenPayload) {
    const primaryRole = rolePriority.find((role) => user.roles.includes(role)) ?? "STUDENT";
    return { primaryRole, ...dashboardByRole[primaryRole] };
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
