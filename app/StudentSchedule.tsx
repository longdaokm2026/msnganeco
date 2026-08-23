"use client";

import { FormEvent, useEffect, useState } from "react";

type StudentSession = {
  id: string;
  classroomName: string;
  title: string;
  topic: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  attendanceStatus: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;
  absenceRequest: { id: string; reason: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" } | null;
};

type Props = { accessToken: string; apiUrl: string; onBack: () => void };

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể xử lý yêu cầu.";
}

export default function StudentSchedule({ accessToken, apiUrl, onBack }: Props) {
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function loadSessions() {
    const response = await fetch(`${apiUrl}/student/sessions`, { headers });
    if (!response.ok) throw new Error(await responseMessage(response));
    setSessions(await response.json() as StudentSession[]);
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await fetch(`${apiUrl}/student/sessions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        if (active) setSessions(await response.json() as StudentSession[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể tải lịch học.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [accessToken, apiUrl]);

  async function requestAbsence(event: FormEvent<HTMLFormElement>, sessionId: string) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const reason = new FormData(event.currentTarget).get("reason");
    try {
      const response = await fetch(`${apiUrl}/sessions/${sessionId}/absence-requests`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setRequestingId(null);
      await loadSessions();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "Không thể gửi đơn xin vắng.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="student-schedule">
      <div className="manager-heading">
        <div>
          <button className="back-button" type="button" onClick={onBack}>← Tổng quan</button>
          <p className="section-kicker">Lịch học của tôi</p>
          <h1>Buổi học & chuyên cần</h1>
          <p>Xem lịch, kết quả điểm danh và gửi đơn xin vắng trước giờ học.</p>
        </div>
      </div>
      {error && <p className="manager-error" role="alert">{error}</p>}
      <div className="student-session-list">
        {loading && !sessions.length && <p className="empty-note">Đang tải lịch học...</p>}
        {!loading && !sessions.length && <p className="empty-note">Bạn chưa có buổi học nào. Giáo viên cần thêm bạn vào lớp trước.</p>}
        {sessions.map((session) => {
          const canRequest = session.status === "SCHEDULED" && new Date(session.scheduledStart) > new Date() && !session.absenceRequest;
          return (
            <article key={session.id}>
              <div className="session-date">
                <strong>{new Date(session.scheduledStart).toLocaleDateString("vi-VN", { day: "2-digit" })}</strong>
                <span>{new Date(session.scheduledStart).toLocaleDateString("vi-VN", { month: "short" })}</span>
              </div>
              <div className="student-session-copy">
                <span>{session.classroomName}</span>
                <h2>{session.title}</h2>
                <p>{new Date(session.scheduledStart).toLocaleString("vi-VN")} · {session.topic ?? "Chưa có nội dung"}</p>
                {session.attendanceStatus && <b className="attendance-pill">{session.attendanceStatus === "PRESENT" ? "Có mặt" : session.attendanceStatus === "ABSENT" ? "Vắng" : session.attendanceStatus === "LATE" ? "Đi muộn" : "Vắng có phép"}</b>}
                {session.absenceRequest && <b className={`request-pill ${session.absenceRequest.status.toLowerCase()}`}>Đơn xin vắng: {session.absenceRequest.status === "PENDING" ? "Chờ duyệt" : session.absenceRequest.status === "APPROVED" ? "Đã duyệt" : "Đã từ chối"}</b>}
              </div>
              <div className="student-session-action">
                {canRequest && <button type="button" onClick={() => setRequestingId(session.id)}>Xin vắng</button>}
              </div>
              {requestingId === session.id && (
                <form onSubmit={(event) => requestAbsence(event, session.id)}>
                  <label>Lý do<textarea name="reason" required maxLength={1000} placeholder="Nêu lý do xin vắng..." /></label>
                  <div><button type="submit" disabled={loading}>Gửi đơn</button><button type="button" onClick={() => setRequestingId(null)}>Hủy</button></div>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
