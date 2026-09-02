"use client";

import { FormEvent, useEffect, useState } from "react";
import WorkspacePageActions from "./WorkspacePageActions";
import EmptyState from "./EmptyState";

type LinkStatus = "PENDING" | "ACTIVE" | "REJECTED" | "REVOKED";

type StudentLink = {
  studentId: string;
  fullName: string;
  email: string;
  studentCode: string | null;
  relationship: string;
  status: LinkStatus;
  isPrimaryContact: boolean;
  requestedAt: string;
};

type StudentOverview = {
  student: { id: string; fullName: string; email: string; studentCode: string | null; schoolName: string | null };
  classes: { id: string; code: string; name: string; level: string | null; teacherName: string; scheduleNote: string | null }[];
  attendanceSummary: { total: number; present: number; absent: number; late: number; excused: number; attendanceRate: number | null };
  upcomingSessions: { id: string; classroomName: string; title: string; topic: string | null; scheduledStart: string; scheduledEnd: string }[];
  recentAttendance: { sessionId: string; classroomName: string; sessionTitle: string; scheduledStart: string; status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"; note: string | null }[];
};

type Props = { accessToken: string; apiUrl: string; onBack: () => void };

const relationshipLabels: Record<string, string> = {
  MOTHER: "Mẹ", FATHER: "Bố", GRANDMOTHER: "Bà", GRANDFATHER: "Ông", SIBLING: "Anh/chị/em", OTHER: "Người giám hộ",
};
const statusLabels: Record<LinkStatus, string> = {
  PENDING: "Chờ học sinh xác nhận", ACTIVE: "Đã liên kết", REJECTED: "Đã từ chối", REVOKED: "Đã thu hồi",
};
const attendanceLabels = { PRESENT: "Có mặt", ABSENT: "Vắng", LATE: "Đi muộn", EXCUSED: "Vắng có phép" };

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể xử lý yêu cầu.";
}

export default function GuardianPortal({ accessToken, apiUrl, onBack }: Props) {
  const [links, setLinks] = useState<StudentLink[]>([]);
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function loadLinks() {
    const response = await fetch(`${apiUrl}/guardian/student-links`, { headers });
    if (!response.ok) throw new Error(await responseMessage(response));
    setLinks(await response.json() as StudentLink[]);
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await fetch(`${apiUrl}/guardian/student-links`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        if (active) setLinks(await response.json() as StudentLink[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể tải liên kết học sinh.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [accessToken, apiUrl]);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch(`${apiUrl}/guardian/student-links`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ studentEmail: data.get("studentEmail"), relationship: data.get("relationship") }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      form.reset();
      setSuccess("Đã gửi yêu cầu. Học sinh cần đăng nhập và xác nhận trước khi bạn xem được dữ liệu.");
      await loadLinks();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể gửi yêu cầu liên kết.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOverview(studentId: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/guardian/students/${studentId}/overview`, { headers });
      if (!response.ok) throw new Error(await responseMessage(response));
      setOverview(await response.json() as StudentOverview);
      setSelectedId(studentId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu học sinh.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke(studentId: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/guardian/student-links/${studentId}`, { method: "DELETE", headers });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (selectedId === studentId) { setSelectedId(null); setOverview(null); }
      await loadLinks();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể thu hồi liên kết.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="guardian-portal">
      <div className="manager-heading">
        <div>
          <WorkspacePageActions onBack={onBack} />
          <p className="section-kicker">Dành cho phụ huynh</p>
          <h1>Theo dõi việc học</h1>
          <p>Liên kết tài khoản học sinh và theo dõi lớp học, lịch học, chuyên cần.</p>
        </div>
      </div>

      {error && <p className="manager-error" role="alert">{error}</p>}
      {success && <p className="manager-success" role="status">{success}</p>}

      <form className="guardian-link-form" onSubmit={requestLink}>
        <div><strong>Liên kết học sinh</strong><span>Học sinh phải xác nhận yêu cầu trong tài khoản của mình.</span></div>
        <label>Email học sinh<input name="studentEmail" type="email" required placeholder="hocsinh@example.com" /></label>
        <label>Quan hệ
          <select name="relationship" defaultValue="MOTHER">
            {Object.entries(relationshipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading}>Gửi yêu cầu</button>
      </form>

      <div className="guardian-workspace">
        <aside className="linked-student-list">
          <div className="panel-label"><span>Học sinh</span><strong>{links.length}</strong></div>
          {!loading && !links.length && <p className="empty-note">Chưa có yêu cầu liên kết nào.</p>}
          {links.map((link) => (
            <article className={selectedId === link.studentId ? "selected" : ""} key={link.studentId}>
              <div><strong>{link.fullName}</strong><small>{link.email}</small><span className={`link-status ${link.status.toLowerCase()}`}>{statusLabels[link.status]}</span></div>
              <div>
                {link.status === "ACTIVE" && <button type="button" onClick={() => loadOverview(link.studentId)}>Xem</button>}
                {["ACTIVE", "PENDING"].includes(link.status) && <button type="button" onClick={() => revoke(link.studentId)}>Thu hồi</button>}
              </div>
            </article>
          ))}
        </aside>

        <div className="guardian-overview">
          {!overview ? (
            <EmptyState title="Chọn học sinh đã liên kết" description="Thông tin học tập sẽ xuất hiện sau khi học sinh xác nhận liên kết." />
          ) : (
            <>
              <div className="guardian-student-heading">
                <div><span>{overview.student.studentCode ?? "Học sinh"}</span><h2>{overview.student.fullName}</h2><p>{overview.student.schoolName ?? overview.student.email}</p></div>
                <b>{overview.attendanceSummary.attendanceRate === null ? "—" : `${overview.attendanceSummary.attendanceRate}%`} chuyên cần</b>
              </div>
              <div className="guardian-metrics">
                <div><span>Tổng buổi</span><strong>{overview.attendanceSummary.total}</strong></div>
                <div><span>Có mặt</span><strong>{overview.attendanceSummary.present}</strong></div>
                <div><span>Đi muộn</span><strong>{overview.attendanceSummary.late}</strong></div>
                <div><span>Vắng</span><strong>{overview.attendanceSummary.absent + overview.attendanceSummary.excused}</strong></div>
              </div>

              <section className="guardian-data-section">
                <h3>Lớp đang học</h3>
                {!overview.classes.length && <p className="empty-note">Chưa tham gia lớp nào.</p>}
                {overview.classes.map((classroom) => (
                  <div className="guardian-data-row" key={classroom.id}>
                    <span><strong>{classroom.name}</strong><small>{classroom.code} · GV {classroom.teacherName}</small></span>
                    <b>{classroom.scheduleNote ?? classroom.level ?? "Chưa có lịch"}</b>
                  </div>
                ))}
              </section>

              <section className="guardian-data-section">
                <h3>Buổi học sắp tới</h3>
                {!overview.upcomingSessions.length && <p className="empty-note">Không có buổi học sắp tới.</p>}
                {overview.upcomingSessions.map((session) => (
                  <div className="guardian-data-row" key={session.id}>
                    <span><strong>{session.title}</strong><small>{session.classroomName} · {session.topic ?? "Chưa có nội dung"}</small></span>
                    <b>{new Date(session.scheduledStart).toLocaleString("vi-VN")}</b>
                  </div>
                ))}
              </section>

              <section className="guardian-data-section">
                <h3>Chuyên cần gần đây</h3>
                {!overview.recentAttendance.length && <p className="empty-note">Chưa có dữ liệu điểm danh.</p>}
                {overview.recentAttendance.map((record) => (
                  <div className="guardian-data-row" key={record.sessionId}>
                    <span><strong>{record.sessionTitle}</strong><small>{record.classroomName} · {new Date(record.scheduledStart).toLocaleDateString("vi-VN")}</small></span>
                    <b className={`attendance-text ${record.status.toLowerCase()}`}>{attendanceLabels[record.status]}</b>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
