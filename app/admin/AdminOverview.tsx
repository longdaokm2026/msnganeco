"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "./types";

type Overview = {
  users: { total: number; active: number; pendingVerification: number; disabled: number };
  roles: { ADMIN: number; TEACHER: number; STUDENT: number; GUARDIAN: number };
  teachers: { active: number; pending: number };
  classrooms: { total: number; active: number };
  registrationsToday: number;
};

export default function AdminOverview({ apiUrl, accessToken }: { apiUrl: string; accessToken: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    adminFetch<Overview>(apiUrl, accessToken, "/admin/overview")
      .then((value) => { if (active) setData(value); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [apiUrl, accessToken]);

  if (error) return <p className="admin-error" role="alert">{error}</p>;
  if (!data) return <p className="admin-loading">Đang tải số liệu hệ thống...</p>;
  const cards = [
    ["Tổng tài khoản", data.users.total, `${data.users.active} đang hoạt động`],
    ["Chờ xác minh email", data.users.pendingVerification, `${data.users.disabled} tài khoản bị khóa`],
    ["Giáo viên hoạt động", data.teachers.active, `${data.teachers.pending} hồ sơ chờ duyệt`],
    ["Lớp học", data.classrooms.total, `${data.classrooms.active} lớp đang hoạt động`],
    ["Đăng ký hôm nay", data.registrationsToday, "Theo múi giờ Việt Nam"],
  ] as const;
  return <>
    <div className="admin-metric-grid">
      {cards.map(([label, value, hint]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}
    </div>
    <section className="admin-panel"><h2>Phân bố vai trò</h2><div className="admin-role-grid">
      <span>Quản trị viên <b>{data.roles.ADMIN}</b></span><span>Giáo viên <b>{data.roles.TEACHER}</b></span>
      <span>Học sinh <b>{data.roles.STUDENT}</b></span><span>Phụ huynh <b>{data.roles.GUARDIAN}</b></span>
    </div></section>
  </>;
}
