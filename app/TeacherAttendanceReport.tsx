"use client";

import { useEffect, useState } from "react";

type AttendanceTotals = {
  completedSessions: number;
  present: number;
  late: number;
  absent: number;
  approvedAbsence: number;
  rejectedAbsence: number;
  pendingAbsence: number;
  billableSessions: number;
};

type AttendanceStudent = AttendanceTotals & {
  classroomId: string;
  classroomName: string;
  studentId: string;
  studentCode: string | null;
  fullName: string;
};

type AttendanceReport = {
  month: string;
  totals: AttendanceTotals;
  students: AttendanceStudent[];
};

type Props = { accessToken: string; apiUrl: string };

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
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể tải báo cáo.";
}

export default function TeacherAttendanceReport({ accessToken, apiUrl }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadReport() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${apiUrl}/dashboard/teacher/attendance?month=${month}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        setReport(await response.json() as AttendanceReport);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Không thể tải báo cáo.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadReport();
    return () => controller.abort();
  }, [accessToken, apiUrl, month]);

  return (
    <section className="teacher-attendance-report" aria-labelledby="attendance-report-title">
      <div className="report-heading">
        <div>
          <p className="section-kicker">Theo dõi theo tháng</p>
          <h2 id="attendance-report-title">Chuyên cần & buổi tính phí</h2>
          <p>Đơn được duyệt không tính phí; đơn bị từ chối vẫn tính như buổi học bình thường.</p>
        </div>
        <label>Tháng<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      </div>

      {error && <p className="manager-error" role="alert">{error}</p>}
      {loading && <p className="empty-note">Đang tổng hợp dữ liệu chuyên cần...</p>}
      {!loading && report && (
        <>
          <div className="report-summary">
            <div><span>Có mặt</span><strong>{report.totals.present}</strong></div>
            <div><span>Đi muộn</span><strong>{report.totals.late}</strong></div>
            <div><span>Vắng</span><strong>{report.totals.absent}</strong></div>
            <div><span>Vắng được duyệt</span><strong>{report.totals.approvedAbsence}</strong></div>
            <div><span>Xin vắng bị từ chối</span><strong>{report.totals.rejectedAbsence}</strong></div>
            <div className="billable-total"><span>Lượt học tính phí</span><strong>{report.totals.billableSessions}</strong></div>
          </div>

          {!report.students.length ? (
            <p className="report-empty">Chưa có buổi học đã hoàn thành trong tháng này.</p>
          ) : (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead><tr><th>Học sinh</th><th>Lớp</th><th>Có mặt</th><th>Muộn</th><th>Vắng</th><th>Duyệt vắng</th><th>Từ chối</th><th>Tính phí</th></tr></thead>
                <tbody>
                  {report.students.map((student) => (
                    <tr key={`${student.classroomId}-${student.studentId}`}>
                      <td><strong>{student.fullName}</strong><small>{student.studentCode ?? "Chưa có mã"}</small></td>
                      <td>{student.classroomName}</td>
                      <td>{student.present}</td>
                      <td>{student.late}</td>
                      <td>{student.absent}</td>
                      <td>{student.approvedAbsence}</td>
                      <td>{student.rejectedAbsence}</td>
                      <td><b>{student.billableSessions}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="billing-note">Số lượt tính phí được tính trên các buổi đã hoàn thành. Chỉ trạng thái “Vắng được duyệt” kèm điểm danh “Vắng có phép” mới được loại khỏi số lượt tính phí.</p>
        </>
      )}
    </section>
  );
}
