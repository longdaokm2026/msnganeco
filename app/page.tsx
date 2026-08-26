"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import ClassroomManager from "./ClassroomManager";
import StudentSchedule from "./StudentSchedule";
import GuardianPortal from "./GuardianPortal";
import StudentGuardianLinks from "./StudentGuardianLinks";
import TeacherAttendanceReport from "./TeacherAttendanceReport";
import AdminManager from "./AdminManager";
import type { AdminSection } from "./admin/types";
import ForgotPassword from "./ForgotPassword";
import TeacherLessonManager from "./TeacherLessonManager";
import StudentLessonViewer from "./StudentLessonViewer";
import TeacherAssignmentManager from "./TeacherAssignmentManager";
import StudentAssignmentManager from "./StudentAssignmentManager";

type AuthMode = "login" | "register" | "forgot";
type Role = "student" | "teacher" | "guardian";
type ApiRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";
type DashboardView = "overview" | "classes" | "lessons" | "assignments" | "student-lessons" | "student-assignments" | "student-schedule" | "student-guardians" | "guardian-portal" | "admin-users" | "admin-teachers" | "admin-classrooms" | "admin-audit";

type SessionUser = {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  status: string;
  roles: ApiRole[];
};

type SessionResponse = { accessToken: string; user: SessionUser };

type DashboardData = {
  primaryRole: ApiRole;
  roleLabel: string;
  title: string;
  description: string;
  metrics: { label: string; value: string; hint: string }[];
  actions: string[];
  teacherOverview?: {
    activeClassCount: number;
    activeStudentCount: number;
    todaySessionCount: number;
    pendingAbsenceCount: number;
    nextSession: { className: string; title: string; scheduledStart: string } | null;
    classes: {
      id: string;
      code: string;
      name: string;
      studentCount: number;
      sessionCount: number;
      nextSession: { title: string; scheduledStart: string } | null;
    }[];
  };
  studentOverview?: {
    activeClassCount: number;
    todaySessionCount: number;
    pendingAbsenceCount: number;
    nextSession: { classroomName: string; title: string; scheduledStart: string } | null;
    month: string;
    monthAttendance: { total: number; present: number; late: number; absent: number; excused: number; attendanceRate: number | null };
    classes: {
      id: string;
      code: string;
      name: string;
      scheduleNote: string | null;
      nextSession: { title: string; scheduledStart: string } | null;
    }[];
  };
};

const roleLabels: Record<Role, string> = {
  student: "Học sinh",
  teacher: "Giáo viên",
  guardian: "Phụ huynh",
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const viewHashes: Record<DashboardView, string> = {
  overview: "overview",
  classes: "classes",
  lessons: "lessons",
  assignments: "assignments",
  "student-lessons": "student-lessons",
  "student-assignments": "student-assignments",
  "student-schedule": "schedule",
  "student-guardians": "guardians",
  "guardian-portal": "students",
  "admin-users": "admin-users",
  "admin-teachers": "admin-teachers",
  "admin-classrooms": "admin-classrooms",
  "admin-audit": "admin-audit",
};

function viewFromHash(): DashboardView {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.slice(1);
  return (Object.entries(viewHashes).find(([, value]) => value === hash)?.[0] as DashboardView | undefined) ?? "overview";
}

function canOpenView(role: ApiRole, view: DashboardView) {
  if (view === "overview") return true;
  if (role === "TEACHER") return view === "classes" || view === "lessons" || view === "assignments";
  if (role === "STUDENT") return view === "student-schedule" || view === "student-lessons" || view === "student-assignments" || view === "student-guardians";
  if (role === "GUARDIAN") return view === "guardian-portal";
  if (role === "ADMIN") return view === "admin-users" || view === "admin-teachers" || view === "admin-classrooms" || view === "admin-audit";
  return false;
}

function quickActionTarget(role: ApiRole, action: string): DashboardView | null {
  const targets: Partial<Record<ApiRole, Record<string, DashboardView>>> = {
    ADMIN: {
      "Quản lý tài khoản": "admin-users",
      "Duyệt giáo viên": "admin-teachers",
      "Quản lý lớp học": "admin-classrooms",
      "Xem nhật ký hệ thống": "admin-audit",
    },
    TEACHER: {
      "Quản lý lớp học": "classes",
      "Quản lý bài học": "lessons",
      "Quản lý bài tập": "assignments",
    },
    STUDENT: {
      "Chuyên cần": "student-schedule",
      "Buổi học & chuyên cần": "student-schedule",
      "Bài học": "student-lessons",
      "Bài tập": "student-assignments",
      "Phụ huynh": "student-guardians",
    },
    GUARDIAN: {
      "Liên kết học sinh": "guardian-portal",
      "Xem chuyên cần": "guardian-portal",
      "Xem kết quả": "guardian-portal",
    },
  };
  return targets[role]?.[action] ?? null;
}

function QuickStartSection({ dashboard, onNavigate }: { dashboard: DashboardData; onNavigate: (view: DashboardView) => void }) {
  return <section className="quick-section" id="quick-actions">
    <div>
      <p className="section-kicker">Bắt đầu nhanh</p>
      <h2>{dashboard.title}</h2>
    </div>
    <div className="action-grid">
      {dashboard.actions.map((action, index) => {
        const target = quickActionTarget(dashboard.primaryRole, action);
        return <button type="button" key={action} disabled={!target} onClick={target ? () => onNavigate(target) : undefined}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{action}</strong>
          <small>{target ? "Mở chức năng" : "Chức năng chưa khả dụng"}</small>
        </button>;
      })}
    </div>
  </section>;
}

async function apiError(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(body?.message)) return body.message.join(" ");
  return body?.message ?? "Có lỗi xảy ra. Vui lòng thử lại.";
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [role, setRole] = useState<Role>("student");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [dashboardView, setDashboardView] = useState<DashboardView>("overview");
  const [assignmentPrefill, setAssignmentPrefill] = useState<{ classroomId: string; lessonId: string; title: string } | null>(null);

  const navigateDashboard = useCallback((view: DashboardView, replace = false) => {
    setDashboardView(view);
    if (typeof window === "undefined") return;
    const url = `${window.location.pathname}${window.location.search}#${viewHashes[view]}`;
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  }, []);

  const openDashboard = useCallback(async (session: SessionResponse) => {
    const response = await fetch(`${apiUrl}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!response.ok) throw new Error(await apiError(response));
    const overview = await response.json() as DashboardData;
    setUser(session.user);
    setDashboard(overview);
    setAccessToken(session.accessToken);
    const requestedView = viewFromHash();
    navigateDashboard(canOpenView(overview.primaryRole, requestedView) ? requestedView : "overview", true);
  }, [navigateDashboard]);

  const returnToOverview = useCallback(async () => {
    navigateDashboard("overview");
    if (!accessToken) return;
    try {
      const response = await fetch(`${apiUrl}/dashboard/overview`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) setDashboard(await response.json() as DashboardData);
    } catch {
      // Keep the last successful overview when a background refresh fails.
    }
  }, [accessToken, navigateDashboard]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await fetch(`${apiUrl}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok || !active) return;
        await openDashboard(await response.json() as SessionResponse);
      } catch {
        // An expired or unavailable local session simply returns to sign-in.
      }
    }

    void restoreSession();
    return () => { active = false; };
  }, [openDashboard]);

  useEffect(() => {
    function syncViewFromAddress() {
      const requestedView = viewFromHash();
      setDashboardView(dashboard && canOpenView(dashboard.primaryRole, requestedView) ? requestedView : "overview");
    }
    window.addEventListener("hashchange", syncViewFromAddress);
    window.addEventListener("popstate", syncViewFromAddress);
    return () => {
      window.removeEventListener("hashchange", syncViewFromAddress);
      window.removeEventListener("popstate", syncViewFromAddress);
    };
  }, [dashboard]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);
    setVerificationToken("");

    const data = new FormData(event.currentTarget);
    const payload = mode === "login"
      ? { email: data.get("email"), password: data.get("password") }
      : {
          fullName: data.get("fullName"),
          email: data.get("email"),
          phone: data.get("phone"),
          password: data.get("password"),
          role: role.toUpperCase(),
        };

    try {
      const response = await fetch(`${apiUrl}/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await apiError(response));

      const body = await response.json() as SessionResponse & { verificationToken?: string };
      if (mode === "login") {
        await openDashboard(body);
      } else {
        setVerificationToken(body.verificationToken ?? "");
        setMessage("Đăng ký thành công. Vui lòng xác minh email trước khi đăng nhập.");
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof TypeError
          ? "Không thể kết nối API. Hãy kiểm tra dịch vụ API tại cổng 4000."
          : error instanceof Error ? error.message : "Có lỗi xảy ra. Vui lòng thử lại.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyDevelopmentEmail() {
    setLoading(true);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch(`${apiUrl}/auth/verify-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      setVerificationToken("");
      setMessage("Email đã được xác minh. Bạn có thể chuyển sang đăng nhập.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Không thể xác minh email.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await fetch(`${apiUrl}/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
      setDashboard(null);
      setAccessToken("");
      navigateDashboard("overview", true);
      setMode("login");
      setMessage("Bạn đã đăng xuất an toàn.");
      setIsError(false);
      setLoading(false);
    }
  }

  if (user && dashboard) {
    const currentView = canOpenView(dashboard.primaryRole, dashboardView) ? dashboardView : "overview";
    return (
      <main className="dashboard-shell">
        <header className="dashboard-header">
          <a className="dashboard-brand" href="#overview" onClick={(event) => { event.preventDefault(); navigateDashboard("overview"); }} aria-label="Ms Ngân English">
            <span className="brand-mark" aria-hidden="true">N</span>
            <span>Ms Ngân English</span>
          </a>
          <p className="dashboard-tagline">Learn with confidence. Grow without limits.</p>
          <div className="account-menu">
            <button className="global-refresh-button" type="button" aria-label="Làm mới trang" title="Làm mới trang" onClick={() => window.location.reload()}>↻</button>
            <span>
              <strong>{user.fullName}</strong>
              <small>{dashboard.roleLabel}</small>
            </span>
            <button type="button" onClick={logout} disabled={loading}>Đăng xuất</button>
          </div>
        </header>

        <div className="dashboard-content" id="dashboard">
          <aside className="dashboard-nav" aria-label="Điều hướng chính">
            <span className="nav-section">Không gian của bạn</span>
            <button className={currentView === "overview" ? "active" : ""} type="button" onClick={() => navigateDashboard("overview")}>Tổng quan</button>
            {dashboard.primaryRole === "ADMIN" ? <>
              <button className={currentView === "admin-users" ? "active" : ""} type="button" onClick={() => navigateDashboard("admin-users")}>Quản lý tài khoản</button>
              <button className={currentView === "admin-teachers" ? "active" : ""} type="button" onClick={() => navigateDashboard("admin-teachers")}>Duyệt giáo viên</button>
              <button className={currentView === "admin-classrooms" ? "active" : ""} type="button" onClick={() => navigateDashboard("admin-classrooms")}>Quản lý lớp học</button>
              <button className={currentView === "admin-audit" ? "active" : ""} type="button" onClick={() => navigateDashboard("admin-audit")}>Xem nhật ký hệ thống</button>
            </> : dashboard.actions.map((action) => {
              const target = quickActionTarget(dashboard.primaryRole, action);
              return target ? (
                <button className={currentView === target ? "active" : ""} type="button" key={action} onClick={() => navigateDashboard(target)}>{action}</button>
              ) : (
                <button type="button" key={action} disabled title="Chức năng sẽ được phát triển ở giai đoạn tiếp theo">{action}</button>
              );
            })}
            <div className="nav-profile">
              <span>Tài khoản</span>
              <strong>{user.fullName}</strong>
              <small>{user.email}</small>
              <small>{user.phone ?? "Chưa cập nhật số điện thoại"}</small>
            </div>
          </aside>

          <section className="dashboard-main" id="overview">
            {dashboard.primaryRole === "ADMIN" && accessToken ? (
              <>
                <AdminManager section={currentView as AdminSection} accessToken={accessToken} apiUrl={apiUrl} currentUserId={user.id} />
                {currentView === "overview" && <QuickStartSection dashboard={dashboard} onNavigate={navigateDashboard} />}
              </>
            ) : currentView === "classes" && accessToken ? (
              <ClassroomManager
                accessToken={accessToken}
                apiUrl={apiUrl}
                onBack={() => { void returnToOverview(); }}
              />
            ) : currentView === "lessons" && accessToken ? (
              <TeacherLessonManager accessToken={accessToken} apiUrl={apiUrl} onBack={() => { void returnToOverview(); }} onCreateAssignment={(prefill) => { setAssignmentPrefill(prefill); navigateDashboard("assignments"); }} />
            ) : currentView === "assignments" && accessToken ? (
              <TeacherAssignmentManager accessToken={accessToken} apiUrl={apiUrl} onBack={() => { void returnToOverview(); }} initialPrefill={assignmentPrefill} onPrefillConsumed={() => setAssignmentPrefill(null)} />
            ) : currentView === "student-lessons" && accessToken ? (
              <StudentLessonViewer accessToken={accessToken} apiUrl={apiUrl} onBack={() => { void returnToOverview(); }} />
            ) : currentView === "student-assignments" && accessToken ? (
              <StudentAssignmentManager accessToken={accessToken} apiUrl={apiUrl} onBack={() => { void returnToOverview(); }} />
            ) : currentView === "student-schedule" && accessToken ? (
              <StudentSchedule accessToken={accessToken} apiUrl={apiUrl} onBack={() => { void returnToOverview(); }} />
            ) : currentView === "student-guardians" && accessToken ? (
              <StudentGuardianLinks accessToken={accessToken} apiUrl={apiUrl} onBack={() => navigateDashboard("overview")} />
            ) : currentView === "guardian-portal" && accessToken ? (
              <GuardianPortal accessToken={accessToken} apiUrl={apiUrl} onBack={() => navigateDashboard("overview")} />
            ) : (
            <>
            <div className="dashboard-intro">
              <div>
                <p className="eyebrow">{dashboard.roleLabel}</p>
                <h1>Xin chào, {user.fullName.split(" ").at(-1)}</h1>
                <p>{dashboard.description}</p>
              </div>
              <span className="phase-badge">Giai đoạn 2D</span>
            </div>

            <div className="metric-grid">
              {dashboard.metrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.hint}</small>
                </article>
              ))}
            </div>

            {dashboard.primaryRole === "TEACHER" && dashboard.teacherOverview && (
              <>
                <section className="teacher-class-overview" aria-labelledby="teacher-classes-title">
                  <div className="overview-section-heading">
                    <div><p className="section-kicker">Dữ liệu đang hoạt động</p><h2 id="teacher-classes-title">Lớp học của bạn</h2></div>
                    <button type="button" onClick={() => navigateDashboard("classes")}>Quản lý lớp học</button>
                  </div>
                  {!dashboard.teacherOverview.classes.length ? (
                    <p className="report-empty">Bạn chưa có lớp học nào.</p>
                  ) : (
                    <div className="teacher-class-grid">
                      {dashboard.teacherOverview.classes.map((classroom) => (
                        <button type="button" key={classroom.id} onClick={() => navigateDashboard("classes")}>
                          <span>{classroom.code}</span>
                          <strong>{classroom.name}</strong>
                          <small>{classroom.studentCount} học sinh · {classroom.sessionCount} buổi học</small>
                          <b>{classroom.nextSession ? `Buổi tới: ${new Date(classroom.nextSession.scheduledStart).toLocaleString("vi-VN")}` : "Chưa lên lịch buổi tiếp theo"}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <TeacherAttendanceReport accessToken={accessToken} apiUrl={apiUrl} />
              </>
            )}

            {dashboard.primaryRole === "STUDENT" && dashboard.studentOverview && (
              <section className="student-dashboard-overview" aria-labelledby="student-classes-title">
                <div className="overview-section-heading">
                  <div><p className="section-kicker">Lịch học đang hoạt động</p><h2 id="student-classes-title">Lớp học của tôi</h2></div>
                  <button type="button" onClick={() => navigateDashboard("student-schedule")}>Xem buổi học</button>
                </div>
                {!dashboard.studentOverview.classes.length ? (
                  <p className="report-empty">Bạn chưa được thêm vào lớp học nào.</p>
                ) : (
                  <div className="student-class-grid">
                    {dashboard.studentOverview.classes.map((classroom) => (
                      <button type="button" key={classroom.id} onClick={() => navigateDashboard("student-schedule")}>
                        <span>{classroom.code}</span>
                        <strong>{classroom.name}</strong>
                        <small>{classroom.scheduleNote ?? "Chưa có lịch học cố định"}</small>
                        <b>{classroom.nextSession ? `Buổi tới: ${new Date(classroom.nextSession.scheduledStart).toLocaleString("vi-VN")}` : "Chưa có buổi học sắp tới"}</b>
                      </button>
                    ))}
                  </div>
                )}
                <div className="student-month-snapshot">
                  <span>Tháng {dashboard.studentOverview.month.split("-").reverse().join("/")}</span>
                  <b>{dashboard.studentOverview.monthAttendance.present} có mặt</b>
                  <b>{dashboard.studentOverview.monthAttendance.late} đi muộn</b>
                  <b>{dashboard.studentOverview.monthAttendance.absent} vắng</b>
                  <b>{dashboard.studentOverview.monthAttendance.excused} vắng có phép</b>
                </div>
              </section>
            )}

            <QuickStartSection dashboard={dashboard} onNavigate={navigateDashboard} />
            </>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (mode === "forgot") return <ForgotPassword apiUrl={apiUrl} onBack={() => { setMode("login"); setMessage(""); }} />;

  return (
    <main className="auth-shell">
      <section className="brand-panel" aria-labelledby="welcome-title">
        <a className="brand" href="#top" aria-label="Ms Ngân English - Trang chủ">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span>Ms Ngân English</span>
        </a>

        <div className="brand-copy">
          <p className="eyebrow">Học tiếng Anh có lộ trình</p>
          <h1 id="welcome-title">Mỗi buổi học đều được ghi nhận và tiếp nối.</h1>
          <p className="intro">
            Lớp học, bài học, chuyên cần và kết quả — rõ ràng cho giáo viên,
            học sinh và phụ huynh trên cùng một hệ thống.
          </p>

          <div className="today-card">
            <div className="today-date" aria-hidden="true">
              <strong>23</strong>
              <span>THÁNG 8</span>
            </div>
            <div>
              <span className="card-label">Buổi học tiếp theo</span>
              <strong>English Foundation · 19:00</strong>
              <span>Unit 4 — Everyday conversations</span>
            </div>
          </div>
        </div>

        <p className="privacy-note">Thông tin học tập được bảo vệ và chỉ hiển thị đúng người có quyền truy cập.</p>
      </section>

      <section className="form-panel" id="top">
        <div className="form-wrap">
          <div className="form-heading">
            <p className="mobile-brand">Ms Ngân English</p>
            <h2>{mode === "login" ? "Chào mừng bạn trở lại" : "Tạo tài khoản mới"}</h2>
            <p>
              {mode === "login"
                ? "Đăng nhập để tiếp tục hành trình học tập hôm nay."
                : "Chọn đúng vai trò để chúng tôi chuẩn bị không gian phù hợp."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
            <button
              className={mode === "login" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => { setMode("login"); setMessage(""); setVerificationToken(""); }}
            >
              Đăng nhập
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => { setMode("register"); setMessage(""); setVerificationToken(""); }}
            >
              Đăng ký
            </button>
          </div>

          {mode === "register" && (
            <div className="role-picker" role="radiogroup" aria-label="Vai trò tài khoản">
              {(Object.keys(roleLabels) as Role[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={role === value}
                  className={role === value ? "selected" : ""}
                  onClick={() => setRole(value)}
                >
                  {roleLabels[value]}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Họ và tên
                <input name="fullName" autoComplete="name" placeholder="Nguyễn Minh Anh" required />
              </label>
            )}

            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="ban@example.com" required />
            </label>

            {mode === "register" && (
              <label>
                {role === "student" ? "Số điện thoại học sinh / phụ huynh" : "Số điện thoại"}
                <input name="phone" type="tel" autoComplete="tel" placeholder="0912 345 678" required />
              </label>
            )}

            <label>
              Mật khẩu
              <span className="password-row">
                <input
                  name="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "Nhập mật khẩu" : "Tối thiểu 8 ký tự"}
                  minLength={8}
                  required
                />
              </span>
            </label>

            {mode === "login" && <button className="forgot-link forgot-button" type="button" onClick={() => setMode("forgot")}>Quên mật khẩu?</button>}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading
                ? "Đang xử lý..."
                : mode === "login" ? "Đăng nhập" : `Đăng ký ${roleLabels[role].toLowerCase()}`}
              <span aria-hidden="true">→</span>
            </button>

            {message && (
              <p className={`form-message${isError ? " error" : ""}`} role={isError ? "alert" : "status"}>
                {message}
              </p>
            )}

            {verificationToken && (
              <button
                className="verification-button"
                type="button"
                disabled={loading}
                onClick={verifyDevelopmentEmail}
              >
                Xác minh email (môi trường phát triển)
              </button>
            )}
          </form>

          <p className="terms">
            Bằng việc tiếp tục, bạn đồng ý với <a href="#terms">Điều khoản sử dụng</a> và
            {" "}<a href="#privacy">Chính sách bảo mật</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
