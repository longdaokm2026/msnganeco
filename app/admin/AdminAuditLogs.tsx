"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch, formatDate, Page } from "./types";

type Audit = { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; createdAt: string; actor: { id: string; fullName: string; email: string } | null };

export default function AdminAuditLogs({ apiUrl, accessToken }: { apiUrl: string; accessToken: string }) {
  const [result, setResult] = useState<Page<Audit> | null>(null); const [action, setAction] = useState(""); const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(1); const [error, setError] = useState("");
  const load = useCallback(async () => { const params = new URLSearchParams({ page: String(page), pageSize: "30" }); if (action.trim()) params.set("action", action.trim()); if (actorId.trim()) params.set("actorId", actorId.trim()); if (from) params.set("from", new Date(`${from}T00:00:00+07:00`).toISOString()); if (to) params.set("to", new Date(`${to}T23:59:59.999+07:00`).toISOString()); try { setResult(await adminFetch(apiUrl, accessToken, `/admin/audit-logs?${params}`)); } catch (reason) { setError((reason as Error).message); } }, [apiUrl, accessToken, page, action, actorId, from, to]);
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "30" }); if (action.trim()) params.set("action", action.trim()); if (actorId.trim()) params.set("actorId", actorId.trim()); if (from) params.set("from", new Date(`${from}T00:00:00+07:00`).toISOString()); if (to) params.set("to", new Date(`${to}T23:59:59.999+07:00`).toISOString());
    adminFetch<Page<Audit>>(apiUrl, accessToken, `/admin/audit-logs?${params}`).then(setResult).catch((reason: Error) => setError(reason.message));
  }, [apiUrl, accessToken, page, action, actorId, from, to]);
  async function submit(event: FormEvent) { event.preventDefault(); setPage(1); await load(); }
  return <section className="admin-panel"><form className="admin-filters admin-audit-filters" onSubmit={submit}><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Hành động"/><input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="UUID người thực hiện"/><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày"/><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày"/><button>Tìm kiếm</button></form>
    {error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>{result?.items.map((item) => <tr key={item.id}><td>{formatDate(item.createdAt)}</td><td>{item.actor ? <>{item.actor.fullName}<small>{item.actor.email}</small></> : "Hệ thống"}</td><td><code>{item.action}</code></td><td>{item.entityType}<small>{item.entityId}</small></td><td><small>{item.metadata ? JSON.stringify(item.metadata) : "—"}</small></td></tr>)}{!result?.items.length && <tr><td colSpan={5}>Chưa có nhật ký phù hợp.</td></tr>}</tbody></table></div>
    <div className="admin-pagination"><span>{result?.total ?? 0} bản ghi</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>{page}/{result?.totalPages || 1}</span><button disabled={!result || page >= result.totalPages} onClick={() => setPage(page + 1)}>Sau</button></div></section>;
}
