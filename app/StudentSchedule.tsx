"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import WorkspacePageActions from "./WorkspacePageActions";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type ScheduleScope = "upcoming" | "history" | "all";

type StudentSession = {
  id: string;
  classroomName: string;
  title: string;
  topic: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  attendanceStatus: AttendanceStatus | null;
  absenceDeadline: string;
  canRequestAbsence: boolean;
  absenceRequest: {
    id: string;
    reason: string;
    status: AbsenceStatus;
    reviewNote: string | null;
    createdAt: string;
  } | null;
};

type AttendanceSummary = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRate: number | null;
};

type AttendanceReport = {
  month: string;
  totals: AttendanceSummary;
  classes: Array<AttendanceSummary & { classroomId: string; classroomName: string }>;
};

type Props = { accessToken: string; apiUrl: string; onBack: () => void };

const attendanceLabels: Record<AttendanceStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  LATE: "Đi muộn",
  EXCUSED: "Vắng có phép",
};

const absenceLabels: Record<AbsenceStatus, string> = {
  PENDING: "Chờ giáo viên duyệt",
  APPROVED: "Đã được duyệt",
  REJECTED: "Đã bị từ chối",
  CANCELLED: "Đã hủy",
};

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(({ type }) => type === "year")?.value}-${parts.find(({ type }) => type === "month")?.value}`;
}

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể xử lý yêu cầu.";
}

export default function StudentSchedule({ accessToken, apiUrl, onBack }: Props) {
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [scope, setScope] = useState<ScheduleScope>("upcoming");
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  const loadSessions = useCallback(async () => {
    const response = await fetch(`${apiUrl}/student/sessions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    setSessions(await response.json() as StudentSession[]);
  }, [accessToken, apiUrl]);

  const loadReport = useCallback(async (selectedMonth: string) => {
    const response = await fetch(`${apiUrl}/dashboard/student/attendance?month=${selectedMonth}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    setReport(await response.json() as AttendanceReport);
  }, [accessToken, apiUrl]);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadSessions(), loadReport(month)]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu chuyên cần.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [loadReport, loadSessions, month]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  const visibleSessions = useMemo(() => {
    return sessions
      .filter((session) => {
        if (scope === "all") return true;
        const upcoming = session.status === "SCHEDULED" && new Date(session.scheduledEnd).getTime() >= currentTime;
        return scope === "upcoming" ? upcoming : !upcoming;
      })
      .sort((a, b) => scope === "history"
        ? new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime()
        : new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  }, [currentTime, scope, sessions]);

  async function requestAbsence(event: FormEvent<HTMLFormElement>, sessionId: string) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const reason = new FormData(event.currentTarget).get("reason");
    try {
      const response = await fetch(`${apiUrl}/sessions/${sessionId}/absence-requests`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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
          <WorkspacePageActions onBack={onBack} />
          <h1 className="manager-title-path">
            <span>Buổi học &amp; chuyên cần</span>
            <i aria-hidden="true">›</i>
            <strong>Lịch học của tôi</strong>
          </h1>
          <p>Theo dõi kết quả điểm danh và gửi đơn xin vắng trước giờ học ít nhất 2 giờ.</p>
        </div>
      </div>

      {error && <p className="manager-error" role="alert">{error}</p>}

      <section className="student-month-report" aria-labelledby="student-month-title">
        <div className="report-heading">
          <div><p className="section-kicker">Thống kê theo tháng</p><h2 id="student-month-title">Kết quả chuyên cần</h2></div>
          <label>Tháng<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        </div>
        <div className="student-report-summary">
          <div className="rate"><span>Tỷ lệ chuyên cần</span><strong>{report?.totals.attendanceRate === null || !report ? "—" : `${report.totals.attendanceRate}%`}</strong></div>
          <div><span>Có mặt</span><strong>{report?.totals.present ?? 0}</strong></div>
          <div><span>Đi muộn</span><strong>{report?.totals.late ?? 0}</strong></div>
          <div><span>Vắng</span><strong>{report?.totals.absent ?? 0}</strong></div>
          <div><span>Vắng có phép</span><strong>{report?.totals.excused ?? 0}</strong></div>
        </div>
        {!!report?.classes.length && (
          <div className="student-class-attendance">
            {report.classes.map((classroom) => (
              <div key={classroom.classroomId}>
                <strong>{classroom.classroomName}</strong>
                <span>{classroom.total} buổi · {classroom.attendanceRate === null ? "Chưa có tỷ lệ" : `${classroom.attendanceRate}% chuyên cần`}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="schedule-toolbar">
        <div role="tablist" aria-label="Lọc buổi học">
          {(["upcoming", "history", "all"] as ScheduleScope[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={scope === value} className={scope === value ? "active" : ""} onClick={() => setScope(value)}>
              {value === "upcoming" ? "Sắp tới" : value === "history" ? "Lịch sử" : "Tất cả"}
            </button>
          ))}
        </div>
        <span>{visibleSessions.length} buổi</span>
      </div>

      <div className="student-session-list">
        {loading && !sessions.length && <p className="empty-note">Đang tải lịch học...</p>}
        {!loading && !visibleSessions.length && <p className="schedule-empty">Không có buổi học phù hợp với bộ lọc này.</p>}
        {visibleSessions.map((session) => {
          const deadlinePassed = new Date(session.absenceDeadline).getTime() < currentTime;
          const hasActiveRequest = session.absenceRequest?.status === "PENDING" || session.absenceRequest?.status === "APPROVED";
          return (
            <article className={`student-session-card ${session.status.toLowerCase()}`} key={session.id}>
              <div className="session-date">
                <strong>{new Date(session.scheduledStart).toLocaleDateString("vi-VN", { day: "2-digit" })}</strong>
                <span>{new Date(session.scheduledStart).toLocaleDateString("vi-VN", { month: "short" })}</span>
              </div>
              <div className="student-session-copy">
                <span>{session.classroomName}</span>
                <h2>{session.title}</h2>
                <p>{new Date(session.scheduledStart).toLocaleString("vi-VN")} – {new Date(session.scheduledEnd).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · {session.topic ?? "Chưa có nội dung"}</p>
                <div className="session-statuses">
                  {session.attendanceStatus ? (
                    <b className={`attendance-pill ${session.attendanceStatus.toLowerCase()}`}>Điểm danh: {attendanceLabels[session.attendanceStatus]}</b>
                  ) : <b className="attendance-pill unmarked">{session.status === "CANCELLED" ? "Buổi học đã hủy" : session.status === "COMPLETED" ? "Chưa ghi nhận điểm danh" : "Chưa đến giờ điểm danh"}</b>}
                  {session.absenceRequest && <b className={`request-pill ${session.absenceRequest.status.toLowerCase()}`}>Đơn xin vắng: {absenceLabels[session.absenceRequest.status]}</b>}
                </div>
                {session.absenceRequest && (
                  <div className="absence-detail">
                    <span><b>Lý do:</b> {session.absenceRequest.reason}</span>
                    {session.absenceRequest.reviewNote && <span><b>Phản hồi:</b> {session.absenceRequest.reviewNote}</span>}
                  </div>
                )}
                {session.status === "SCHEDULED" && (
                  <p className={`absence-deadline${deadlinePassed && !hasActiveRequest ? " expired" : ""}`}>
                    {hasActiveRequest
                      ? `Đơn đã gửi lúc ${new Date(session.absenceRequest!.createdAt).toLocaleString("vi-VN")} và đang được ghi nhận.`
                      : deadlinePassed
                      ? "Đã hết hạn gửi đơn xin vắng."
                      : `Có thể gửi đơn đến ${new Date(session.absenceDeadline).toLocaleString("vi-VN")} (trước giờ học 2 giờ).`}
                  </p>
                )}
              </div>
              <div className="student-session-action">
                {session.canRequestAbsence && <button type="button" onClick={() => setRequestingId(session.id)}>{session.absenceRequest?.status === "REJECTED" ? "Gửi lại đơn" : "Xin vắng"}</button>}
              </div>
              {requestingId === session.id && (
                <form onSubmit={(event) => requestAbsence(event, session.id)}>
                  <label>Lý do<textarea name="reason" required minLength={5} maxLength={1000} placeholder="Nêu rõ lý do xin vắng..." /></label>
                  <small>Đơn cần được giáo viên duyệt. Gửi đơn không đồng nghĩa đã được phép vắng.</small>
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
