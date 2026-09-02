"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch, formatDate, Page } from "./types";
import { auditActionLabel, auditDetails, auditEntityLabel } from "./audit-display";

type Audit = { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; displayEntityName: string | null; referenceNames: Record<string, string | string[]>; createdAt: string; actor: { id: string; fullName: string; email: string } | null };

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
    {error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-table-wrap"><table className="admin-table admin-audit-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>{result?.items.map((item) => { const details = auditDetails(item.metadata, item.referenceNames); return <tr key={item.id}><td>{formatDate(item.createdAt)}</td><td>{item.actor ? <>{item.actor.fullName}<small>{item.actor.email}</small></> : "Hệ thống"}</td><td><strong className="audit-action-label" title={item.action}>{auditActionLabel(item.action)}</strong></td><td><strong>{auditEntityLabel(item.entityType)}</strong><small>{item.displayEntityName || "Đối tượng không còn tồn tại"}</small></td><td>{details.length ? <dl className="audit-details">{details.map((detail) => <div key={detail.key}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl> : <span className="audit-empty-detail">Không có thông tin bổ sung</span>}</td></tr>; })}{!result?.items.length && <tr><td colSpan={5}>Chưa có nhật ký phù hợp.</td></tr>}</tbody></table></div>
    <div className="admin-pagination"><span>{result?.total ?? 0} bản ghi</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>{page}/{result?.totalPages || 1}</span><button disabled={!result || page >= result.totalPages} onClick={() => setPage(page + 1)}>Sau</button></div></section>;
}
