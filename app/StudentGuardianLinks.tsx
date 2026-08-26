"use client";

import { useEffect, useState } from "react";
import WorkspacePageActions from "./WorkspacePageActions";

type GuardianLink = {
  guardianId: string;
  fullName: string;
  email: string;
  phone: string | null;
  relationship: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "REVOKED";
  isPrimaryContact: boolean;
  requestedAt: string;
};

type Props = { accessToken: string; apiUrl: string; onBack: () => void };
const relationshipLabels: Record<string, string> = {
  MOTHER: "Mẹ", FATHER: "Bố", GRANDMOTHER: "Bà", GRANDFATHER: "Ông", SIBLING: "Anh/chị/em", OTHER: "Người giám hộ",
};

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể xử lý yêu cầu.";
}

export default function StudentGuardianLinks({ accessToken, apiUrl, onBack }: Props) {
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function loadLinks() {
    const response = await fetch(`${apiUrl}/student/guardian-links`, { headers });
    if (!response.ok) throw new Error(await responseMessage(response));
    setLinks(await response.json() as GuardianLink[]);
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await fetch(`${apiUrl}/student/guardian-links`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        if (active) setLinks(await response.json() as GuardianLink[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể tải danh sách phụ huynh.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [accessToken, apiUrl]);

  async function review(guardianId: string, decision: "APPROVED" | "REJECTED") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/student/guardian-links/${guardianId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadLinks();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xử lý yêu cầu.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke(guardianId: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/student/guardian-links/${guardianId}`, { method: "DELETE", headers });
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadLinks();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể thu hồi liên kết.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="student-guardian-links">
      <div className="manager-heading">
        <div>
          <WorkspacePageActions onBack={onBack} />
          <p className="section-kicker">Quyền riêng tư</p>
          <h1>Liên kết phụ huynh</h1>
          <p>Chỉ chấp thuận người bạn biết. Phụ huynh được chấp thuận có thể xem lớp, lịch và chuyên cần của bạn.</p>
        </div>
      </div>
      {error && <p className="manager-error" role="alert">{error}</p>}
      <div className="student-guardian-list">
        {loading && !links.length && <p className="empty-note">Đang tải yêu cầu...</p>}
        {!loading && !links.length && <p className="empty-note">Chưa có yêu cầu liên kết phụ huynh.</p>}
        {links.map((link) => (
          <article key={link.guardianId}>
            <div className="guardian-avatar">{link.fullName.trim().charAt(0).toUpperCase()}</div>
            <div>
              <span>{relationshipLabels[link.relationship] ?? link.relationship}{link.isPrimaryContact ? " · Liên hệ chính" : ""}</span>
              <h2>{link.fullName}</h2>
              <p>{link.email}{link.phone ? ` · ${link.phone}` : ""}</p>
              <small>Yêu cầu ngày {new Date(link.requestedAt).toLocaleDateString("vi-VN")}</small>
            </div>
            <div className="guardian-link-actions">
              {link.status === "PENDING" && <>
                <button type="button" onClick={() => review(link.guardianId, "APPROVED")} disabled={loading}>Chấp thuận</button>
                <button type="button" onClick={() => review(link.guardianId, "REJECTED")} disabled={loading}>Từ chối</button>
              </>}
              {link.status === "ACTIVE" && <>
                <b>Đã liên kết</b>
                <button type="button" onClick={() => revoke(link.guardianId)} disabled={loading}>Thu hồi quyền</button>
              </>}
              {link.status === "REJECTED" && <b className="rejected">Đã từ chối</b>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
