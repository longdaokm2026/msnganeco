"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch, AdminUser, formatDate, Page } from "./types";

export default function AdminUsers({ apiUrl, accessToken, currentUserId }: { apiUrl: string; accessToken: string; currentUserId: string }) {
  const [result, setResult] = useState<Page<AdminUser> | null>(null);
  const [query, setQuery] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUser | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (query.trim()) params.set("search", query.trim()); if (role) params.set("role", role); if (status) params.set("status", status);
    try { setError(""); setResult(await adminFetch<Page<AdminUser>>(apiUrl, accessToken, `/admin/users?${params}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể tải tài khoản."); }
  }, [apiUrl, accessToken, page, query, role, status]);
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (query.trim()) params.set("search", query.trim()); if (role) params.set("role", role); if (status) params.set("status", status);
    adminFetch<Page<AdminUser>>(apiUrl, accessToken, `/admin/users?${params}`).then(setResult).catch((reason: Error) => setError(reason.message));
  }, [apiUrl, accessToken, page, query, role, status]);

  async function submit(event: FormEvent) { event.preventDefault(); setPage(1); await load(); }
  async function view(userId: string) {
    try { setSelected(await adminFetch<AdminUser>(apiUrl, accessToken, `/admin/users/${userId}`)); } catch (reason) { setError((reason as Error).message); }
  }
  async function toggle(user: AdminUser) {
    const next = user.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    try { setBusy(user.id); await adminFetch(apiUrl, accessToken, `/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }); await load(); if (selected?.id === user.id) await view(user.id); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  return <section className="admin-panel">
    <form className="admin-filters" onSubmit={submit}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm email hoặc họ tên" aria-label="Tìm tài khoản" />
      <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Lọc vai trò"><option value="">Tất cả vai trò</option><option value="ADMIN">Quản trị viên</option><option value="TEACHER">Giáo viên</option><option value="STUDENT">Học sinh</option><option value="GUARDIAN">Phụ huynh</option></select>
      <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="PENDING_VERIFICATION">Chờ xác minh</option><option value="DISABLED">Đã khóa</option></select>
      <button type="submit">Tìm kiếm</button>
    </form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Xác thực email</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>
      {result?.items.map((user) => <tr key={user.id}><td>{user.fullName}</td><td>{user.email}</td><td>{user.roles.join(", ")}</td><td><span className={`status-pill status-${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.emailVerifiedAt ? "Đã xác thực" : "Chưa xác thực"}</td><td>{formatDate(user.createdAt)}</td><td><div className="admin-actions"><button type="button" onClick={() => void view(user.id)}>Xem</button><button type="button" disabled={busy === user.id || (user.id === currentUserId && user.status !== "DISABLED")} onClick={() => void toggle(user)}>{user.status === "DISABLED" ? "Mở khóa" : "Khóa"}</button></div></td></tr>)}
      {!result?.items.length && <tr><td colSpan={7}>Không có tài khoản phù hợp.</td></tr>}
    </tbody></table></div>
    <div className="admin-pagination"><span>{result?.total ?? 0} tài khoản</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>{page}/{result?.totalPages || 1}</span><button disabled={!result || page >= result.totalPages} onClick={() => setPage(page + 1)}>Sau</button></div>
    {selected && <aside className="admin-detail"><button className="admin-close" onClick={() => setSelected(null)} aria-label="Đóng">×</button><h3>{selected.fullName}</h3><p>{selected.email} · {selected.phone ?? "Chưa có SĐT"}</p><p>Vai trò: {selected.roles.join(", ")}</p><p>Trạng thái: {selected.status}</p>{selected.teacherProfile && <p>Duyệt giáo viên: {selected.teacherProfile.approvalStatus}</p>}</aside>}
  </section>;
}
