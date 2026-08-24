"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import ClassroomManager from "./ClassroomManager";
import StudentSchedule from "./StudentSchedule";
import GuardianPortal from "./GuardianPortal";
import StudentGuardianLinks from "./StudentGuardianLinks";

type AuthMode = "login" | "register";
type Role = "student" | "teacher" | "guardian";
type ApiRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";
type DashboardView = "overview" | "classes" | "student-schedule" | "student-guardians" | "guardian-portal";

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
  "student-schedule": "schedule",
  "student-guardians": "guardians",
  "guardian-portal": "students",
};

function viewFromHash(): DashboardView {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.slice(1);
  return (Object.entries(viewHashes).find(([, value]) => value === hash)?.[0] as DashboardView | undefined) ?? "overview";
}

function canOpenView(role: ApiRole, view: DashboardView) {
  if (view === "overview") return true;
  if (role === "TEACHER") return view === "classes";
  if (role === "STUDENT") return view === "student-schedule" || view === "student-guardians";
  if (role === "GUARDIAN") return view === "guardian-portal";
  return false;
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
          <div className="account-menu">
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
            {dashboard.actions.map((action) =>
              dashboard.primaryRole === "TEACHER" && action === "Tạo lớp học" ? (
                <button className={currentView === "classes" ? "active" : ""} type="button" key={action} onClick={() => navigateDashboard("classes")}>{action}</button>
              ) : dashboard.primaryRole === "STUDENT" && action === "Xem lớp học" ? (
                <button className={currentView === "student-schedule" ? "active" : ""} type="button" key={action} onClick={() => navigateDashboard("student-schedule")}>{action}</button>
              ) : dashboard.primaryRole === "STUDENT" && action === "Quản lý phụ huynh" ? (
                <button className={currentView === "student-guardians" ? "active" : ""} type="button" key={action} onClick={() => navigateDashboard("student-guardians")}>{action}</button>
              ) : dashboard.primaryRole === "GUARDIAN" && action === "Liên kết học sinh" ? (
                <button className={currentView === "guardian-portal" ? "active" : ""} type="button" key={action} onClick={() => navigateDashboard("guardian-portal")}>{action}</button>
              ) : <button type="button" key={action} disabled title="Chức năng sẽ được phát triển ở giai đoạn tiếp theo">{action}</button>,
            )}
            <div className="nav-profile">
              <span>Tài khoản</span>
              <strong>{user.email}</strong>
              <small>{user.phone}</small>
            </div>
          </aside>

          <section className="dashboard-main" id="overview">
            {currentView === "classes" && accessToken ? (
              <ClassroomManager
                accessToken={accessToken}
                apiUrl={apiUrl}
                onBack={() => navigateDashboard("overview")}
              />
            ) : currentView === "student-schedule" && accessToken ? (
              <StudentSchedule accessToken={accessToken} apiUrl={apiUrl} onBack={() => navigateDashboard("overview")} />
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
              <span className="phase-badge">Giai đoạn 2C</span>
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

            <section className="quick-section" id="quick-actions">
              <div>
                <p className="section-kicker">Bắt đầu nhanh</p>
                <h2>{dashboard.title}</h2>
              </div>
              <div className="action-grid">
                {dashboard.actions.map((action, index) => {
                  const opensClasses = dashboard.primaryRole === "TEACHER" && action === "Tạo lớp học";
                  const opensStudentSchedule = dashboard.primaryRole === "STUDENT" && action === "Xem lớp học";
                  const opensStudentGuardians = dashboard.primaryRole === "STUDENT" && action === "Quản lý phụ huynh";
                  const opensGuardianPortal = dashboard.primaryRole === "GUARDIAN" && action === "Liên kết học sinh";
                  return (
                  <button
                    type="button"
                    key={action}
                    disabled={!opensClasses && !opensStudentSchedule && !opensStudentGuardians && !opensGuardianPortal}
                    onClick={opensClasses
                      ? () => navigateDashboard("classes")
                      : opensStudentSchedule ? () => navigateDashboard("student-schedule")
                      : opensStudentGuardians ? () => navigateDashboard("student-guardians")
                      : opensGuardianPortal ? () => navigateDashboard("guardian-portal") : undefined}
                  >
                    <span>0{index + 1}</span>
                    <strong>{action}</strong>
                    <small>{opensClasses || opensStudentSchedule || opensStudentGuardians || opensGuardianPortal ? "Mở chức năng" : "Sẽ được mở ở giai đoạn chức năng tiếp theo"}</small>
                  </button>
                );})}
              </div>
            </section>
            </>
            )}
          </section>
        </div>
      </main>
    );
  }

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

            {mode === "login" && <a className="forgot-link" href="#forgot-password">Quên mật khẩu?</a>}

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
