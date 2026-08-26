"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Session = {
  id: string;
  title: string;
  topic: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
};

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type AttendanceRow = {
  studentId: string;
  fullName: string;
  email: string;
  studentCode: string | null;
  attendanceStatus: AttendanceStatus | null;
  attendanceNote: string | null;
  absenceRequest: {
    id: string;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    reviewNote: string | null;
  } | null;
};

type Props = { classroomId: string; accessToken: string; apiUrl: string };

const attendanceLabels: Record<AttendanceStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  LATE: "Đi muộn",
  EXCUSED: "Vắng có phép",
};

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể xử lý yêu cầu.";
}

export default function SessionManager({ classroomId, accessToken, apiUrl }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function loadSessions(preferredId?: string) {
    const response = await fetch(`${apiUrl}/classes/${classroomId}/sessions`, { headers });
    if (!response.ok) throw new Error(await responseMessage(response));
    const items = await response.json() as Session[];
    setSessions(items);
    if (preferredId) {
      const item = items.find(({ id }) => id === preferredId) ?? null;
      setSelected(item);
      if (item) await loadAttendance(item);
    }
  }

  const loadAttendance = useCallback(async (session: Session) => {
    setSelected(session);
    setError("");
    const response = await fetch(`${apiUrl}/sessions/${session.id}/attendance`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    const body = await response.json() as { rows: AttendanceRow[] };
    setRows(body.rows.map((row) => ({ ...row, attendanceStatus: row.attendanceStatus ?? "PRESENT" })));
  }, [accessToken, apiUrl]);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await fetch(`${apiUrl}/classes/${classroomId}/sessions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        if (active) {
          const items = await response.json() as Session[];
          setSessions(items);
          const now = Date.now();
          const defaultSession = items.find((item) => item.status === "SCHEDULED" && new Date(item.scheduledStart).getTime() >= now)
            ?? items.find((item) => item.status === "SCHEDULED")
            ?? items.at(-1);
          if (defaultSession) {
            await loadAttendance(defaultSession);
          } else {
            setSelected(null);
            setRows([]);
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể tải buổi học.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [classroomId, accessToken, apiUrl, loadAttendance]);

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch(`${apiUrl}/classes/${classroomId}/sessions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          topic: data.get("topic") || undefined,
          scheduledStart: new Date(String(data.get("scheduledStart"))).toISOString(),
          scheduledEnd: new Date(String(data.get("scheduledEnd"))).toISOString(),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const created = await response.json() as Session;
      form.reset();
      setShowCreate(false);
      await loadSessions(created.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo buổi học.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(studentId: string, field: "attendanceStatus" | "attendanceNote", value: string) {
    setRows((current) => current.map((row) => row.studentId === studentId ? { ...row, [field]: value } : row));
  }

  async function saveAttendance() {
    if (!selected || !rows.length) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/sessions/${selected.id}/attendance`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          records: rows.map((row) => ({
            studentId: row.studentId,
            status: row.attendanceStatus ?? "PRESENT",
            note: row.attendanceNote?.trim() || undefined,
          })),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadSessions(selected.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu điểm danh.");
    } finally {
      setLoading(false);
    }
  }

  async function reviewAbsence(requestId: string, decision: "APPROVED" | "REJECTED") {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/absence-requests/${requestId}/review`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadAttendance(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể duyệt đơn xin vắng.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="session-manager">
      <div className="session-section-heading">
        <div><span>Chuyên cần</span><strong>{sessions.length} buổi</strong></div>
        <button type="button" onClick={() => setShowCreate((value) => !value)}>+ Lên lịch buổi học</button>
      </div>

      <p className="session-guide">
        <span>1. Lên lịch buổi học</span><span>2. Chọn buổi học</span><span>3. Điểm danh và lưu</span>
      </p>

      {error && <p className="session-error" role="alert">{error}</p>}

      {showCreate && (
        <form className="session-form" onSubmit={createSession}>
          <label>Tên buổi học<input name="title" required maxLength={160} placeholder="Unit 4 · Daily routines" /></label>
          <label>Nội dung chính<input name="topic" maxLength={2000} placeholder="Vocabulary, speaking practice..." /></label>
          <label>Bắt đầu<input name="scheduledStart" type="datetime-local" required /></label>
          <label>Kết thúc<input name="scheduledEnd" type="datetime-local" required /></label>
          <button type="submit" disabled={loading}>Tạo buổi học</button>
        </form>
      )}

      <div className="session-layout">
        <div className="session-list">
          {loading && !sessions.length && <p className="empty-note">Đang tải buổi học...</p>}
          {!loading && !sessions.length && (
            <div className="session-empty">
              <strong>Chưa có buổi học</strong>
              <span>Tạo buổi học đầu tiên để bắt đầu điểm danh.</span>
              <button type="button" onClick={() => setShowCreate(true)}>+ Tạo buổi học đầu tiên</button>
            </div>
          )}
          {sessions.map((session) => (
            <button
              type="button"
              className={selected?.id === session.id ? "selected" : ""}
              aria-pressed={selected?.id === session.id}
              key={session.id}
              onClick={() => loadAttendance(session).catch((reason) => setError(String(reason)))}
            >
              <span><strong>{session.title}</strong><small>{new Date(session.scheduledStart).toLocaleString("vi-VN")}</small></span>
              <b>{session.status === "COMPLETED" ? "Đã học" : session.status === "CANCELLED" ? "Đã hủy" : "Sắp học"}</b>
            </button>
          ))}
        </div>

        <div className="attendance-sheet">
          {!selected ? (
            <div className="attendance-empty">
              <strong>{sessions.length ? "Chọn một buổi học" : "Hãy tạo buổi học trước"}</strong>
              <span>{sessions.length ? "Chọn buổi học ở danh sách bên trái để mở sổ điểm danh." : "Sau khi tạo, buổi học sẽ tự động được chọn và danh sách học sinh sẽ hiện tại đây."}</span>
            </div>
          ) : (
            <>
              <div className="attendance-heading">
                <div><strong>{selected.title}</strong><small>{new Date(selected.scheduledStart).toLocaleString("vi-VN")} · {selected.topic ?? "Chưa có nội dung chính"}</small></div>
                {!!rows.length && <button type="button" onClick={saveAttendance} disabled={loading}>Lưu điểm danh</button>}
              </div>
              {!rows.length && <p className="empty-note">Lớp chưa có học sinh để điểm danh.</p>}
              {rows.map((row) => (
                <article className="attendance-row" key={row.studentId}>
                  <div className="attendance-student"><strong>{row.fullName}</strong><small>{row.studentCode ?? row.email}</small></div>
                  <select
                    aria-label={`Trạng thái của ${row.fullName}`}
                    value={row.attendanceStatus ?? "PRESENT"}
                    onChange={(event) => updateRow(row.studentId, "attendanceStatus", event.target.value)}
                  >
                    {(Object.keys(attendanceLabels) as AttendanceStatus[]).map((status) => <option key={status} value={status}>{attendanceLabels[status]}</option>)}
                  </select>
                  <input
                    aria-label={`Ghi chú cho ${row.fullName}`}
                    value={row.attendanceNote ?? ""}
                    onChange={(event) => updateRow(row.studentId, "attendanceNote", event.target.value)}
                    placeholder="Ghi chú"
                    maxLength={500}
                  />
                  {row.absenceRequest && (
                    <div className={`absence-review ${row.absenceRequest.status.toLowerCase()}`}>
                      <span><b>Xin vắng:</b> {row.absenceRequest.reason}</span>
                      {row.absenceRequest.status === "PENDING" ? (
                        <div>
                          <button type="button" onClick={() => reviewAbsence(row.absenceRequest!.id, "APPROVED")}>Duyệt</button>
                          <button type="button" onClick={() => reviewAbsence(row.absenceRequest!.id, "REJECTED")}>Từ chối</button>
                        </div>
                      ) : <strong>{row.absenceRequest.status === "APPROVED" ? "Đã duyệt" : "Đã từ chối"}</strong>}
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
