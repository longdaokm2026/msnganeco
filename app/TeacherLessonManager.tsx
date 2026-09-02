"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import WorkspacePageActions from "./WorkspacePageActions";
import EmptyState from "./EmptyState";

type SessionItem = { id: string; title: string; scheduledStart: string; classroom: { id: string; name: string; code: string }; lesson: { id: string; title: string; status: string; updatedAt: string; publishedAt: string | null } | null };
type Attachment = { id: string; fileName: string; fileType: string; fileSize: number; category: string; downloadUrl: string };
type Lesson = { id: string; sessionId: string; status: string; title: string; summary: string | null; mainContent: string | null; theory: string | null; vocabulary: string | null; grammar: string | null; examples: string | null; reviewNotes: string | null; homeworkNotes: string | null; publishedAt: string | null; updatedAt: string; updatedBy: { fullName: string }; attachments: Attachment[]; session: { scheduledStart: string; classroom: { id: string; name: string; code: string } } };
type RelatedAssignment = { id: string; title: string; status: string; dueAt: string | null };
type Operation = "save" | "publish" | "archive" | "upload" | "delete" | null;
type Feedback = { kind: "success" | "error"; text: string } | null;

const fields: [keyof Lesson, string, number][] = [["summary", "Tóm tắt nội dung chính", 3], ["mainContent", "Nội dung chính", 7], ["theory", "Lý thuyết", 5], ["vocabulary", "Từ vựng", 5], ["grammar", "Ngữ pháp", 5], ["examples", "Ví dụ", 5], ["reviewNotes", "Nội dung cần ôn", 4], ["homeworkNotes", "Bài tập / chuẩn bị buổi sau", 4]];
const contentKeys = fields.map(([key]) => key);
const labels: Record<string, string> = { DRAFT: "Bản nháp", PUBLISHED: "Đã xuất bản", CLOSED: "Đã đóng", ARCHIVED: "Đã lưu trữ" };
const publishHelp = "Cần nhập tiêu đề và ít nhất một nội dung hoặc tài liệu trước khi xuất bản.";
const date = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const time = (value: string) => new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" });
const formSnapshot = (value: Lesson | null) => value ? JSON.stringify({ title: value.title, ...Object.fromEntries(contentKeys.map((key) => [key, value[key] ?? ""])) }) : "";
const payloadFor = (value: Lesson) => Object.fromEntries(["title", ...contentKeys].map((key) => [key, value[key as keyof Lesson]]));

function friendlyError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message.trim() : "";
  if (/file too large|payload too large|10\s*mb/i.test(message)) return "File vượt quá giới hạn 10 MB.";
  if (/định dạng|file type|unsupported|mimetype/i.test(message)) return "Định dạng file không được hỗ trợ.";
  return message && message !== "Không thể xử lý bài học." ? message : fallback;
}

export default function TeacherLessonManager({ apiUrl, accessToken, onBack, onCreateAssignment }: { apiUrl: string; accessToken: string; onBack: () => void; onCreateAssignment?: (prefill: { classroomId: string; lessonId: string; title: string }) => void }) {
  const [items, setItems] = useState<SessionItem[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [operation, setOperation] = useState<Operation>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pageError, setPageError] = useState("");
  const [relatedAssignments, setRelatedAssignments] = useState<RelatedAssignment[]>([]);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const api = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể xử lý bài học.");
    return body as T;
  }, [apiUrl, accessToken]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ month, pageSize: "100" });
    if (status) params.set("status", status);
    if (classroomId) params.set("classroomId", classroomId);
    try { const result = await api<{ items: SessionItem[] }>(`/teacher/lessons?${params}`); setItems(result.items); setPageError(""); }
    catch (reason) { setPageError(friendlyError(reason, "Không thể tải danh sách bài học.")); }
  }, [api, month, status, classroomId]);

  useEffect(() => {
    const params = new URLSearchParams({ month, pageSize: "100" });
    if (status) params.set("status", status);
    if (classroomId) params.set("classroomId", classroomId);
    api<{ items: SessionItem[] }>(`/teacher/lessons?${params}`).then((result) => { setItems(result.items); setPageError(""); }).catch((reason: unknown) => setPageError(friendlyError(reason, "Không thể tải danh sách bài học.")));
  }, [api, month, status, classroomId]);
  useEffect(() => {
    if (feedback?.kind !== "success") return;
    const timer = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (!lesson?.id) return;
    api<{ items: RelatedAssignment[] }>(`/assignments?lessonId=${lesson.id}&pageSize=100`).then((value) => setRelatedAssignments(value.items)).catch(() => setRelatedAssignments([]));
  }, [api, lesson?.id]);

  const currentSnapshot = useMemo(() => formSnapshot(lesson), [lesson]);
  const isDirty = Boolean(lesson) && currentSnapshot !== savedSnapshot;
  const canPublish = Boolean(lesson?.title.trim()) && (contentKeys.some((key) => String(lesson?.[key] ?? "").trim()) || Boolean(lesson?.attachments.length));
  const busy = operation !== null;

  function acceptLesson(value: Lesson) { setLesson(value); setSavedSnapshot(formSnapshot(value)); }

  async function open(sessionId: string) {
    if (busy) return;
    try { setPageError(""); setFeedback(null); setSavedAt(null); acceptLesson(await api(`/sessions/${sessionId}/lesson`)); }
    catch (reason) { setPageError(friendlyError(reason, "Không thể mở bài học.")); }
  }

  async function persist(value: Lesson) {
    return api<Lesson>(`/sessions/${value.sessionId}/lesson`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadFor(value)) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!lesson || busy) return;
    setOperation("save"); setFeedback(null);
    try {
      const updated = await persist(lesson); acceptLesson(updated); setSavedAt(new Date().toISOString());
      setFeedback({ kind: "success", text: lesson.status === "DRAFT" ? "✓ Đã lưu nội dung bài học." : "✓ Đã cập nhật bài học." }); await load();
    } catch (reason) { setFeedback({ kind: "error", text: friendlyError(reason, "Không thể lưu bài học. Vui lòng thử lại.") }); }
    finally { setOperation(null); }
  }

  async function publish() {
    if (!lesson || busy || !canPublish) return;
    setOperation("publish"); setFeedback(null);
    try {
      const saved = isDirty ? await persist(lesson) : lesson;
      if (isDirty) acceptLesson(saved);
      const published = await api<Lesson>(`/sessions/${saved.sessionId}/lesson/publish`, { method: "POST" });
      acceptLesson(published); setSavedAt(new Date().toISOString()); setFeedback({ kind: "success", text: "✓ Bài học đã được xuất bản." }); await load();
    } catch (reason) { setFeedback({ kind: "error", text: friendlyError(reason, "Không thể xuất bản bài học.") }); }
    finally { setOperation(null); }
  }

  async function archive() {
    if (!lesson || busy) return;
    setOperation("archive"); setFeedback(null);
    try {
      const saved = isDirty ? await persist(lesson) : lesson;
      if (isDirty) acceptLesson(saved);
      const archived = await api<Lesson>(`/sessions/${saved.sessionId}/lesson/archive`, { method: "POST" });
      acceptLesson(archived); setSavedAt(new Date().toISOString()); setFeedback({ kind: "success", text: "✓ Bài học đã được lưu trữ." }); await load();
    } catch (reason) { setFeedback({ kind: "error", text: friendlyError(reason, "Không thể lưu trữ bài học.") }); }
    finally { setOperation(null); }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target; const file = input.files?.[0];
    if (!lesson || !file || busy) return;
    if (file.size > 10 * 1024 * 1024) { setFeedback({ kind: "error", text: "File vượt quá giới hạn 10 MB." }); input.value = ""; return; }
    if (!/\.(jpe?g|png|webp|pdf|docx|pptx)$/i.test(file.name)) { setFeedback({ kind: "error", text: "Định dạng file không được hỗ trợ." }); input.value = ""; return; }
    const form = new FormData(); form.append("file", file); setOperation("upload"); setFeedback(null);
    try {
      const attachment = await api<Attachment>(`/sessions/${lesson.sessionId}/lesson/attachments`, { method: "POST", body: form });
      setLesson({ ...lesson, attachments: [...lesson.attachments, attachment] }); setFeedback({ kind: "success", text: "✓ Đã tải tài liệu lên." });
    } catch (reason) { setFeedback({ kind: "error", text: friendlyError(reason, "Không thể tải tài liệu lên. Vui lòng thử lại.") }); }
    finally { setOperation(null); input.value = ""; }
  }

  async function remove(id: string) {
    if (!lesson || busy || !window.confirm("Xóa tài liệu đính kèm này?")) return;
    setOperation("delete"); setFeedback(null);
    try {
      await api(`/sessions/${lesson.sessionId}/lesson/attachments/${id}`, { method: "DELETE" });
      setLesson({ ...lesson, attachments: lesson.attachments.filter((item) => item.id !== id) }); setFeedback({ kind: "success", text: "✓ Đã xóa tài liệu." });
    } catch (reason) { setFeedback({ kind: "error", text: friendlyError(reason, "Không thể xóa tài liệu.") }); }
    finally { setOperation(null); }
  }

  async function download(item: Attachment) {
    try {
      const response = await fetch(`${apiUrl}${item.downloadUrl}`, { headers }); if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = item.fileName; anchor.click(); URL.revokeObjectURL(url);
    } catch { setFeedback({ kind: "error", text: "Không thể tải tài liệu." }); }
  }

  const classrooms = [...new Map(items.map((item) => [item.classroom.id, item.classroom])).values()];
  const editState = isDirty ? "Có thay đổi chưa lưu" : lesson?.status === "PUBLISHED" ? `Đã xuất bản · Cập nhật lần cuối ${time(lesson.updatedAt)}` : lesson?.status === "ARCHIVED" ? `Đã lưu trữ · Cập nhật lần cuối ${time(lesson.updatedAt)}` : savedAt ? `Đã lưu lúc ${time(savedAt)}` : lesson ? `Cập nhật lần cuối ${time(lesson.updatedAt)}` : "";

  return <div className="lesson-manager">
    <div className="manager-heading"><div><WorkspacePageActions onBack={onBack} /><h1 className="manager-title-path"><span>Quản lý bài học</span><i aria-hidden="true">›</i><strong>Bài học theo buổi</strong></h1></div></div>
    <div className="lesson-filters"><select value={classroomId} onChange={(e) => setClassroomId(e.target.value)}><option value="">Tất cả lớp</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option><option value="DRAFT">Bản nháp</option><option value="PUBLISHED">Đã xuất bản</option><option value="ARCHIVED">Đã lưu trữ</option></select></div>
    {pageError && <p className="admin-error">{pageError}</p>}
    <div className="lesson-workspace">
      <aside className="lesson-session-list"><h2>Danh sách buổi học</h2>{items.map((item) => <button disabled={busy} className={lesson?.sessionId === item.id ? "active" : ""} key={item.id} onClick={() => void open(item.id)}><time>{new Date(item.scheduledStart).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}</time><span><b>{item.lesson?.title ?? item.title}</b><small>{item.classroom.name}</small><em className={`lesson-status ${item.lesson?.status ?? "DRAFT"}`}>{labels[item.lesson?.status ?? "DRAFT"]}</em></span></button>)}{!items.length && <p className="report-empty">Chưa có buổi học trong bộ lọc.</p>}</aside>
      <section className="lesson-editor">{lesson ? <form onSubmit={save}>
        <div className="lesson-meta"><span className={`lesson-status ${lesson.status}`}>{labels[lesson.status]}</span><span>Buổi học: {date(lesson.session.scheduledStart)}</span><span>Lớp: {lesson.session.classroom.name}</span><span>Xuất bản: {lesson.publishedAt ? date(lesson.publishedAt) : "—"}</span><span>Cập nhật: {date(lesson.updatedAt)} · {lesson.updatedBy.fullName}</span></div>
        <label>Tiêu đề bài học<input maxLength={200} value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} /></label>
        {fields.map(([key, label, rows]) => <label key={key}>{label}<textarea rows={rows} value={String(lesson[key] ?? "")} onChange={(e) => setLesson({ ...lesson, [key]: e.target.value })} /></label>)}
        <section className="lesson-related-assignments"><div><h3>Bài tập liên quan <span>{relatedAssignments.length}</span></h3>{onCreateAssignment && <button type="button" onClick={() => onCreateAssignment({ classroomId: lesson.session.classroom.id, lessonId: lesson.id, title: lesson.title })}>+ Tạo bài tập từ bài học</button>}</div>{relatedAssignments.map((item) => <article key={item.id}><b>{item.title}</b><span>{labels[item.status] ?? item.status}{item.dueAt ? ` · Hạn ${date(item.dueAt)}` : ""}</span></article>)}{!relatedAssignments.length && <p>Chưa có bài tập liên quan.</p>}</section>
        <section className="lesson-attachments"><div><h3>Tài liệu đính kèm</h3><label className={`upload-button${busy ? " disabled" : ""}`}>{operation === "upload" ? "Đang tải tài liệu..." : "+ Thêm ảnh / tài liệu"}<input disabled={busy} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.pptx" onChange={(e) => void upload(e)} /></label></div>{lesson.attachments.map((item) => <article key={item.id}><button disabled={busy} type="button" onClick={() => void download(item)}><b>{item.fileName}</b><small>{item.category} · {(item.fileSize / 1024).toFixed(0)} KB</small></button><button disabled={busy} type="button" onClick={() => void remove(item.id)}>{operation === "delete" ? "Đang xóa..." : "Xóa"}</button></article>)}{!lesson.attachments.length && <p>Chưa có tài liệu đính kèm.</p>}</section>
        <div className="lesson-action-panel" aria-live="polite">
          <div className="lesson-action-state"><span className={isDirty ? "unsaved" : "saved"}>{editState}</span>{lesson.status === "DRAFT" && !canPublish && <small>{publishHelp}</small>}{feedback && <p className={`lesson-feedback ${feedback.kind}`}>{feedback.text}</p>}</div>
          <div className="lesson-actions">
            <button disabled={busy || !isDirty}>{operation === "save" ? "Đang lưu..." : lesson.status === "DRAFT" ? "Lưu" : "Lưu cập nhật"}</button>
            {lesson.status === "DRAFT" && <button className="publish-button" type="button" disabled={busy || !canPublish} title={!canPublish ? publishHelp : "Xuất bản bài học"} onClick={() => void publish()}>{operation === "publish" ? "Đang xuất bản..." : "Xuất bản"}</button>}
            {lesson.status === "PUBLISHED" && <button className="archive-button" type="button" disabled={busy} onClick={() => void archive()}>{operation === "archive" ? "Đang lưu trữ..." : "Lưu trữ"}</button>}
          </div>
        </div>
      </form> : <EmptyState title="Chọn một buổi học" description="Chọn buổi học bên trái để soạn hoặc cập nhật nội dung." />}</section>
    </div>
  </div>;
}
