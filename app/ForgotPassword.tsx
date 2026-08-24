"use client";

import { FormEvent, useState } from "react";

export default function ForgotPassword({ apiUrl, onBack }: { apiUrl: string; onBack: () => void }) {
  const [loading, setLoading] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email") }) });
      if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "Không thể gửi hướng dẫn."); }
      setMessage("Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể gửi hướng dẫn."); } finally { setLoading(false); }
  }
  return <main className="auth-shell"><section className="brand-panel"><button className="brand brand-button" type="button" onClick={onBack}><span className="brand-mark">N</span><span>Ms Ngân English</span></button><div className="brand-copy"><p className="eyebrow">Bảo mật tài khoản</p><h1>Khôi phục quyền truy cập của bạn.</h1><p className="intro">Chúng tôi sẽ gửi một liên kết đặt lại mật khẩu có hiệu lực trong 30 phút.</p></div></section><section className="form-panel"><div className="form-wrap"><div className="form-heading"><h2>Quên mật khẩu</h2><p>Nhập email đã dùng để đăng ký tài khoản.</p></div><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="email" required /></label><button className="primary-button" disabled={loading}>{loading ? "Đang gửi..." : "Gửi hướng dẫn"}<span>→</span></button>{message && <p className="form-message">{message}</p>}{error && <p className="form-message error" role="alert">{error}</p>}<button className="auth-text-button" type="button" onClick={onBack}>← Quay lại đăng nhập</button></form></div></section></main>;
}
