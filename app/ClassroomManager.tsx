"use client";

import { FormEvent, useEffect, useState } from "react";
import SessionManager from "./SessionManager";

type Classroom = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: string | null;
  scheduleNote: string | null;
  maxStudents: number;
  studentCount: number;
};

type Student = {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
};

type Props = {
  accessToken: string;
  apiUrl: string;
  onBack: () => void;
};

async function messageFrom(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message)
    ? body.message.join(" ")
    : body?.message ?? "Không thể xử lý yêu cầu.";
}

export default function ClassroomManager({ accessToken, apiUrl, onBack }: Props) {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState<Classroom | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  async function loadClasses(preferredId?: string) {
    const response = await fetch(`${apiUrl}/classes`, { headers: authHeaders });
    if (!response.ok) throw new Error(await messageFrom(response));
    const items = await response.json() as Classroom[];
    setClasses(items);
    if (preferredId) setSelected(items.find((item) => item.id === preferredId) ?? null);
  }

  async function loadRoster(classroom: Classroom) {
    setSelected(classroom);
    setSearchResults([]);
    const response = await fetch(`${apiUrl}/classes/${classroom.id}/students`, {
      headers: authHeaders,
    });
    if (!response.ok) throw new Error(await messageFrom(response));
    const body = await response.json() as { students: Student[] };
    setRoster(body.students);
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await fetch(`${apiUrl}/classes`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(await messageFrom(response));
        if (active) setClasses(await response.json() as Classroom[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể tải lớp học.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [accessToken, apiUrl]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/classes`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          level: data.get("level") || undefined,
          scheduleNote: data.get("scheduleNote") || undefined,
          description: data.get("description") || undefined,
          maxStudents: Number(data.get("maxStudents") || 30),
        }),
      });
      if (!response.ok) throw new Error(await messageFrom(response));
      const classroom = await response.json() as Classroom;
      await loadClasses(classroom.id);
      setRoster([]);
      setShowCreate(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo lớp học.");
    } finally {
      setLoading(false);
    }
  }

  async function searchStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const query = new FormData(event.currentTarget).get("query")?.toString().trim();
    if (!query || query.length < 2) return;
    const response = await fetch(`${apiUrl}/classes/students/search?q=${encodeURIComponent(query)}`, {
      headers: authHeaders,
    });
    if (!response.ok) {
      setError(await messageFrom(response));
      return;
    }
    setSearchResults(await response.json() as Student[]);
  }

  async function addStudent(student: Student) {
    if (!selected) return;
    setError("");
    const response = await fetch(`${apiUrl}/classes/${selected.id}/students`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id }),
    });
    if (!response.ok) {
      setError(await messageFrom(response));
      return;
    }
    await Promise.all([loadRoster(selected), loadClasses(selected.id)]);
    setSearchResults([]);
  }

  async function removeStudent(studentId: string) {
    if (!selected) return;
    setError("");
    const response = await fetch(`${apiUrl}/classes/${selected.id}/students/${studentId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (!response.ok) {
      setError(await messageFrom(response));
      return;
    }
    await Promise.all([loadRoster(selected), loadClasses(selected.id)]);
  }

  return (
    <section className="classroom-manager">
      <div className="manager-heading">
        <div>
          <button className="back-button" type="button" onClick={onBack}>← Tổng quan</button>
          <p className="section-kicker">Quản lý lớp học</p>
          <h1>Lớp học của tôi</h1>
          <p>Tạo lớp và thêm những học sinh đã đăng ký tài khoản.</p>
        </div>
        <button className="new-class-button" type="button" onClick={() => setShowCreate(true)}>
          + Tạo lớp mới
        </button>
      </div>

      {error && <p className="manager-error" role="alert">{error}</p>}

      {showCreate && (
        <form className="create-class-form" onSubmit={createClass}>
          <div className="form-title">
            <h2>Thông tin lớp mới</h2>
            <button type="button" onClick={() => setShowCreate(false)}>Đóng</button>
          </div>
          <div className="class-form-grid">
            <label>Tên lớp<input name="name" placeholder="English Foundation A1" required maxLength={120} /></label>
            <label>Trình độ<input name="level" placeholder="A1, A2, IELTS..." maxLength={60} /></label>
            <label>Lịch học<input name="scheduleNote" placeholder="Thứ 3, Thứ 5 · 19:00" maxLength={160} /></label>
            <label>Sĩ số tối đa<input name="maxStudents" type="number" min={1} max={200} defaultValue={30} /></label>
            <label className="wide-field">Mô tả<input name="description" placeholder="Mục tiêu và ghi chú của lớp" maxLength={1000} /></label>
          </div>
          <button className="primary-button" type="submit" disabled={loading}>Tạo lớp học</button>
        </form>
      )}

      <div className="classroom-workspace">
        <div className="class-list-panel">
          <div className="panel-label"><span>Danh sách lớp</span><strong>{classes.length}</strong></div>
          {loading && !classes.length && <p className="empty-note">Đang tải lớp học...</p>}
          {!loading && !classes.length && <p className="empty-note">Bạn chưa có lớp nào. Hãy tạo lớp đầu tiên.</p>}
          {classes.map((classroom) => (
            <button
              type="button"
              className={`class-list-item${selected?.id === classroom.id ? " selected" : ""}`}
              key={classroom.id}
              onClick={() => loadRoster(classroom).catch((reason) => setError(String(reason)))}
            >
              <span><strong>{classroom.name}</strong><small>{classroom.code} · {classroom.level ?? "Chưa đặt trình độ"}</small></span>
              <b>{classroom.studentCount}/{classroom.maxStudents}</b>
            </button>
          ))}
        </div>

        <div className="roster-panel">
          {!selected ? (
            <div className="roster-empty"><strong>Chọn một lớp học</strong><span>Danh sách học sinh sẽ hiển thị tại đây.</span></div>
          ) : (
            <>
              <div className="roster-heading">
                <div><span>{selected.code}</span><h2>{selected.name}</h2><p>{selected.scheduleNote ?? "Chưa có lịch học"}</p></div>
                <strong>{roster.length}/{selected.maxStudents} học sinh</strong>
              </div>

              <form className="student-search" onSubmit={searchStudent}>
                <input name="query" placeholder="Tìm bằng email, họ tên hoặc mã học sinh" minLength={2} required />
                <button type="submit">Tìm học sinh</button>
              </form>

              {!!searchResults.length && (
                <div className="search-results">
                  {searchResults.map((student) => (
                    <div key={student.id}>
                      <span><strong>{student.fullName}</strong><small>{student.email} · {student.studentCode ?? "Chưa có mã"}</small></span>
                      <button type="button" onClick={() => addStudent(student)}>Thêm vào lớp</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="roster-list">
                {!roster.length && <p className="empty-note">Lớp chưa có học sinh.</p>}
                {roster.map((student, index) => (
                  <div className="roster-row" key={student.id}>
                    <span className="student-number">{String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{student.fullName}</strong><small>{student.email} · {student.studentCode ?? "Chưa có mã học sinh"}</small></span>
                    <button type="button" onClick={() => removeStudent(student.id)}>Loại khỏi lớp</button>
                  </div>
                ))}
              </div>
              <SessionManager classroomId={selected.id} accessToken={accessToken} apiUrl={apiUrl} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
