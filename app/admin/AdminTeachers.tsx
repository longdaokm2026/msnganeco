"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, AdminUser, formatDate, Page } from "./types";

type PendingTeacher = { userId: string; bio: string | null; createdAt: string; user: AdminUser };

export default function AdminTeachers({ apiUrl, accessToken }: { apiUrl: string; accessToken: string }) {
  const [result, setResult] = useState<Page<PendingTeacher> | null>(null); const [rejecting, setRejecting] = useState("");
  const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(async () => { try { setResult(await adminFetch(apiUrl, accessToken, "/admin/teachers/pending?pageSize=100")); } catch (reason) { setError((reason as Error).message); } }, [apiUrl, accessToken]);
  useEffect(() => {
    adminFetch<Page<PendingTeacher>>(apiUrl, accessToken, "/admin/teachers/pending?pageSize=100").then(setResult).catch((reason: Error) => setError(reason.message));
  }, [apiUrl, accessToken]);
  async function decide(userId: string, decision: "approve" | "reject") {
    try {
      setBusy(userId); setError("");
      await adminFetch(apiUrl, accessToken, `/admin/teachers/${userId}/${decision}`, { method: "POST", body: JSON.stringify(decision === "reject" ? { rejectionNote: note } : {}) });
      setRejecting(""); setNote(""); await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  return <section className="admin-panel">
    <p className="admin-panel-note">Giáo viên chỉ có thể quản lý lớp và chuyên cần sau khi được duyệt.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Họ tên</th><th>Email</th><th>Số điện thoại</th><th>Ngày đăng ký</th><th>Thao tác</th></tr></thead><tbody>
      {result?.items.map(({ userId, user, createdAt }) => <tr key={userId}><td>{user.fullName}</td><td>{user.email}</td><td>{user.phone ?? "—"}</td><td>{formatDate(createdAt)}</td><td><div className="admin-actions"><button className="admin-approve" disabled={busy === userId} onClick={() => void decide(userId, "approve")}>Duyệt</button><button disabled={busy === userId} onClick={() => setRejecting(userId)}>Từ chối</button></div>
        {rejecting === userId && <div className="admin-reject-box"><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Lý do từ chối (không bắt buộc)" /><button onClick={() => void decide(userId, "reject")}>Xác nhận từ chối</button><button onClick={() => { setRejecting(""); setNote(""); }}>Hủy</button></div>}</td></tr>)}
      {!result?.items.length && <tr><td colSpan={5}>Không có giáo viên chờ duyệt.</td></tr>}
    </tbody></table></div>
  </section>;
}
