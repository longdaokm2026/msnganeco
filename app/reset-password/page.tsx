"use client";

import { FormEvent, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ResetPasswordPage() {
  const [token] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "");
  const [loading, setLoading] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: data.get("password"), passwordConfirmation: data.get("passwordConfirmation") }) });
      const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
      if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      setMessage("Mật khẩu đã được cập nhật.");
    } catch (reason) { setError((reason as Error).message); } finally { setLoading(false); }
  }
  return <main className="auth-shell"><section className="brand-panel"><button className="brand brand-button" type="button" onClick={() => { window.location.href = "/"; }}><span className="brand-mark">N</span><span>Ms Ngân English</span></button><div className="brand-copy"><p className="eyebrow">Mật khẩu mới</p><h1>Bắt đầu lại một cách an toàn.</h1><p className="intro">Liên kết chỉ dùng được một lần và mọi phiên đăng nhập cũ sẽ kết thúc.</p></div></section><section className="form-panel"><div className="form-wrap"><div className="form-heading"><h2>Đặt lại mật khẩu</h2><p>Chọn mật khẩu mới có ít nhất 8 ký tự.</p></div>{!token ? <p className="form-message error">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</p> : message ? <><p className="form-message">{message}</p><button className="primary-button auth-primary-link" type="button" onClick={() => { window.location.href = "/"; }}>Đăng nhập <span>→</span></button></> : <form onSubmit={submit}><label>Mật khẩu mới<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required /></label><label>Nhập lại mật khẩu mới<input name="passwordConfirmation" type="password" minLength={8} maxLength={128} autoComplete="new-password" required /></label><button className="primary-button" disabled={loading}>{loading ? "Đang cập nhật..." : "Đặt lại mật khẩu"}<span>→</span></button>{error && <p className="form-message error" role="alert">{error}</p>}</form>}</div></section></main>;
}
