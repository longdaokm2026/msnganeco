"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch, AdminClassroom, formatDate, Page } from "./types";

type ClassroomDetail = AdminClassroom & {
  description: string | null; capacity: { current: number; maximum: number };
  students: { id: string; fullName: string; email: string; studentCode: string | null }[];
  upcomingSessions: { id: string; title: string; scheduledStart: string; scheduledEnd: string; status: string }[];
};

export default function AdminClassrooms({ apiUrl, accessToken }: { apiUrl: string; accessToken: string }) {
  const [result, setResult] = useState<Page<AdminClassroom> | null>(null); const [query, setQuery] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1); const [detail, setDetail] = useState<ClassroomDetail | null>(null); const [error, setError] = useState("");
  const load = useCallback(async () => { const params = new URLSearchParams({ page: String(page), pageSize: "20" }); if (query.trim()) params.set("search", query.trim()); if (status) params.set("status", status); try { setResult(await adminFetch(apiUrl, accessToken, `/admin/classrooms?${params}`)); } catch (reason) { setError((reason as Error).message); } }, [apiUrl, accessToken, page, query, status]);
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" }); if (query.trim()) params.set("search", query.trim()); if (status) params.set("status", status);
    adminFetch<Page<AdminClassroom>>(apiUrl, accessToken, `/admin/classrooms?${params}`).then(setResult).catch((reason: Error) => setError(reason.message));
  }, [apiUrl, accessToken, page, query, status]);
  async function submit(event: FormEvent) { event.preventDefault(); setPage(1); await load(); }
  async function open(id: string) { try { setDetail(await adminFetch(apiUrl, accessToken, `/admin/classrooms/${id}`)); } catch (reason) { setError((reason as Error).message); } }
  return <section className="admin-panel">
    <form className="admin-filters" onSubmit={submit}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên hoặc mã lớp" aria-label="Tìm lớp"/><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="ARCHIVED">Đã lưu trữ</option></select><button>Tìm kiếm</button></form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Lớp học</th><th>Giáo viên</th><th>Sĩ số</th><th>Trạng thái</th><th>Ngày tạo</th><th></th></tr></thead><tbody>{result?.items.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.code}</small></td><td>{item.teacher.fullName}<small>{item.teacher.email}</small></td><td>{item.studentCount}/{item.maxStudents}</td><td>{item.status}</td><td>{formatDate(item.createdAt)}</td><td><button onClick={() => void open(item.id)}>Xem</button></td></tr>)}{!result?.items.length && <tr><td colSpan={6}>Không có lớp phù hợp.</td></tr>}</tbody></table></div>
    <div className="admin-pagination"><span>{result?.total ?? 0} lớp</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>{page}/{result?.totalPages || 1}</span><button disabled={!result || page >= result.totalPages} onClick={() => setPage(page + 1)}>Sau</button></div>
    {detail && <aside className="admin-detail admin-detail-wide"><button className="admin-close" onClick={() => setDetail(null)}>×</button><p className="section-kicker">{detail.code}</p><h3>{detail.name}</h3><p>Giáo viên: {detail.teacher.fullName} · {detail.teacher.email}</p><p>Sĩ số: {detail.capacity.current}/{detail.capacity.maximum} · {detail.status}</p><h4>Học sinh</h4><ul>{detail.students.map((student) => <li key={student.id}>{student.fullName} · {student.email}</li>)}</ul><h4>Buổi học sắp tới</h4><ul>{detail.upcomingSessions.map((session) => <li key={session.id}>{session.title} · {formatDate(session.scheduledStart)}</li>)}{!detail.upcomingSessions.length && <li>Chưa có buổi học sắp tới.</li>}</ul></aside>}
  </section>;
}
