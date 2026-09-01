"use client";

import { FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from "react";
import { adminFetch, AdminUser, formatDate, Page } from "./types";

const defaultColumnWidths = [130, 260, 115, 175, 145, 130, 270];
const minimumColumnWidths = [100, 180, 90, 140, 120, 110, 210];

export default function AdminUsers({ apiUrl, accessToken, currentUserId }: { apiUrl: string; accessToken: string; currentUserId: string }) {
  const [result, setResult] = useState<Page<AdminUser> | null>(null);
  const [query, setQuery] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUser | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null); const [editName, setEditName] = useState(""); const [editPhone, setEditPhone] = useState(""); const [notice, setNotice] = useState("");
  const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
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
    const question = next === "DISABLED" ? "Khóa tài khoản này? Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa. Dữ liệu hiện có không bị xóa." : "Mở khóa tài khoản này?";
    if (!window.confirm(question)) return;
    try { setBusy(user.id); await adminFetch(apiUrl, accessToken, `/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }); await load(); if (selected?.id === user.id) await view(user.id); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  function startEdit(user: AdminUser) { setEditing(user); setEditName(user.fullName); setEditPhone(user.phone ?? ""); setError(""); }
  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    try { setBusy(editing.id); const updated = await adminFetch<AdminUser>(apiUrl, accessToken, `/admin/users/${editing.id}/profile`, { method: "PATCH", body: JSON.stringify({ fullName: editName, phone: editPhone }) }); setEditing(null); setSelected(selected?.id === updated.id ? updated : selected); setNotice("Đã cập nhật thông tin tài khoản."); await load(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  async function resend(user: AdminUser) {
    if (!window.confirm(`Gửi lại email xác thực tới ${user.email}?`)) return;
    try { setBusy(user.id); const response = await adminFetch<{ message: string }>(apiUrl, accessToken, `/admin/users/${user.id}/resend-verification`, { method: "POST", body: "{}" }); setNotice(response.message); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  async function remove(user: AdminUser) {
    if (!window.confirm("Xóa vĩnh viễn tài khoản này?\nChỉ những tài khoản chưa phát sinh dữ liệu học tập mới có thể xóa. Hành động này không thể hoàn tác.")) return;
    if (window.prompt(`Nhập email ${user.email} để xác nhận:`) !== user.email) { setError("Email xác nhận không khớp. Tài khoản chưa bị xóa."); return; }
    try { setBusy(user.id); await adminFetch(apiUrl, accessToken, `/admin/users/${user.id}`, { method: "DELETE", body: JSON.stringify({ reason: "Xóa từ màn hình quản trị" }) }); setSelected(null); setNotice("Đã xóa tài khoản."); await load(); }
    catch (reason) { const message = (reason as Error).message; setError(message.includes("dữ liệu học tập") ? `${message} Bạn có thể dùng chức năng Khóa.` : message); } finally { setBusy(""); }
  }
  function startColumnResize(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[index] ?? defaultColumnWidths[index]!;
    const move = (pointerEvent: PointerEvent) => {
      const nextWidth = Math.max(minimumColumnWidths[index]!, startWidth + pointerEvent.clientX - startX);
      setColumnWidths((current) => current.map((width, position) => position === index ? nextWidth : width));
    };
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
  }
  function resizeColumnWithKeyboard(index: number, direction: number) {
    setColumnWidths((current) => current.map((width, position) => position === index ? Math.max(minimumColumnWidths[index]!, width + direction * 10) : width));
  }
  const columnHeaders = ["Họ tên", "Email", "Vai trò", "Trạng thái", "Xác thực email", "Ngày tạo", "Thao tác"];
  return <section className="admin-panel">
    <form className="admin-filters" onSubmit={submit}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm email hoặc họ tên" aria-label="Tìm tài khoản" />
      <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Lọc vai trò"><option value="">Tất cả vai trò</option><option value="ADMIN">Quản trị viên</option><option value="TEACHER">Giáo viên</option><option value="STUDENT">Học sinh</option><option value="GUARDIAN">Phụ huynh</option></select>
      <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="PENDING_VERIFICATION">Chờ xác minh</option><option value="DISABLED">Đã khóa</option></select>
      <button type="submit">Tìm kiếm</button>
    </form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}
    <div className="admin-table-wrap admin-user-table-wrap"><table className="admin-table admin-user-table" style={{ width: Math.max(columnWidths.reduce((sum, width) => sum + width, 0), 1100) }}><colgroup>{columnWidths.map((width, index) => <col key={columnHeaders[index]} style={{ width }} />)}</colgroup><thead><tr>{columnHeaders.map((header, index) => <th key={header}><span>{header}</span><button className="admin-column-resizer" type="button" aria-label={`Điều chỉnh độ rộng cột ${header}`} title="Kéo để đổi độ rộng; dùng phím mũi tên để tinh chỉnh" onPointerDown={(event) => startColumnResize(index, event)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizeColumnWithKeyboard(index, event.key === "ArrowLeft" ? -1 : 1); } }} /></th>)}</tr></thead><tbody>
      {result?.items.map((user) => <tr key={user.id}><td className="admin-user-name" title={user.fullName}>{user.fullName}</td><td className="admin-user-email" title={user.email}>{user.email}</td><td>{user.roles.join(", ")}</td><td><span className={`status-pill status-${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.emailVerifiedAt ? "Đã xác thực" : "Chưa xác thực"}</td><td className="admin-user-created">{formatDate(user.createdAt)}</td><td><div className="admin-actions admin-user-actions"><button type="button" onClick={() => void view(user.id)}>Xem</button><button type="button" onClick={() => startEdit(user)}>Sửa</button>{!user.emailVerifiedAt && user.status !== "DISABLED" && <button type="button" disabled={busy === user.id} onClick={() => void resend(user)}>Gửi xác thực</button>}<button type="button" disabled={busy === user.id || user.id === currentUserId} onClick={() => void toggle(user)}>{user.status === "DISABLED" ? "Mở khóa" : "Khóa"}</button><button className="admin-delete" type="button" disabled={busy === user.id || user.id === currentUserId} onClick={() => void remove(user)}>Xóa</button></div></td></tr>)}
      {!result?.items.length && <tr><td colSpan={7}>Không có tài khoản phù hợp.</td></tr>}
    </tbody></table></div>
    <div className="admin-pagination"><span>{result?.total ?? 0} tài khoản</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>{page}/{result?.totalPages || 1}</span><button disabled={!result || page >= result.totalPages} onClick={() => setPage(page + 1)}>Sau</button></div>
    {selected && <aside className="admin-detail"><button className="admin-close" onClick={() => setSelected(null)} aria-label="Đóng">×</button><h3>{selected.fullName}</h3><p>{selected.email} · {selected.phone ?? "Chưa có SĐT"}</p><p>Vai trò: {selected.roles.join(", ")}</p><p>Trạng thái: {selected.status}</p>{selected.teacherProfile && <p>Duyệt giáo viên: {selected.teacherProfile.approvalStatus}</p>}</aside>}
    {editing && <aside className="admin-detail"><button className="admin-close" onClick={() => setEditing(null)} aria-label="Đóng">×</button><h3>Sửa tài khoản</h3><form className="admin-edit-form" onSubmit={saveEdit}><label>Họ và tên<input required maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Số điện thoại<input maxLength={30} value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="Để trống để xóa" /></label><div className="admin-dialog-actions"><button type="button" onClick={() => setEditing(null)}>Hủy</button><button type="submit" disabled={busy === editing.id}>{busy === editing.id ? "Đang lưu..." : "Lưu thay đổi"}</button></div></form></aside>}
  </section>;
}
