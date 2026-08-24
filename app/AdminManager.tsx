"use client";

import AdminAuditLogs from "./admin/AdminAuditLogs";
import AdminClassrooms from "./admin/AdminClassrooms";
import AdminOverview from "./admin/AdminOverview";
import AdminTeachers from "./admin/AdminTeachers";
import AdminUsers from "./admin/AdminUsers";
import type { AdminSection } from "./admin/types";

const titles: Record<AdminSection, [string, string]> = {
  overview: ["Tổng quan quản trị", "Theo dõi tài khoản, giáo viên và lớp học từ dữ liệu thực."],
  "admin-users": ["Quản lý tài khoản", "Tìm kiếm, xem và kiểm soát trạng thái tài khoản."],
  "admin-teachers": ["Duyệt giáo viên", "Xét duyệt hồ sơ giáo viên mới trước khi giảng dạy."],
  "admin-classrooms": ["Quản lý lớp học", "Theo dõi lớp, giáo viên, sĩ số và lịch học ở chế độ chỉ đọc."],
  "admin-audit": ["Nhật ký hệ thống", "Tra cứu các thay đổi quan trọng đã được ghi nhận."],
};

export default function AdminManager({ section, apiUrl, accessToken, currentUserId }: { section: AdminSection; apiUrl: string; accessToken: string; currentUserId: string }) {
  const [title, description] = titles[section];
  return <div className="admin-manager"><div className="dashboard-intro"><div><p className="eyebrow">Quản trị viên</p><h1>{title}</h1><p>{description}</p></div><span className="phase-badge">Giai đoạn 2E</span></div>
    {section === "overview" && <AdminOverview apiUrl={apiUrl} accessToken={accessToken} />}
    {section === "admin-users" && <AdminUsers apiUrl={apiUrl} accessToken={accessToken} currentUserId={currentUserId} />}
    {section === "admin-teachers" && <AdminTeachers apiUrl={apiUrl} accessToken={accessToken} />}
    {section === "admin-classrooms" && <AdminClassrooms apiUrl={apiUrl} accessToken={accessToken} />}
    {section === "admin-audit" && <AdminAuditLogs apiUrl={apiUrl} accessToken={accessToken} />}
  </div>;
}
