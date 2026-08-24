export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };
export type AdminSection = "overview" | "admin-users" | "admin-teachers" | "admin-classrooms" | "admin-audit";

export type AdminUser = {
  id: string; fullName: string; email: string; phone: string | null; status: string;
  emailVerifiedAt: string | null; createdAt: string; roles: string[];
  teacherProfile?: { approvalStatus: string; approvedAt: string | null; rejectedAt: string | null; rejectionNote: string | null } | null;
};

export type AdminClassroom = {
  id: string; code: string; name: string; level: string | null; scheduleNote: string | null;
  maxStudents: number; studentCount: number; status: string; createdAt: string;
  teacher: { id: string; fullName: string; email: string };
};

export async function adminFetch<T>(apiUrl: string, accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    throw new Error(Array.isArray(body?.message) ? body.message.join(" ") : body?.message ?? "Không thể tải dữ liệu quản trị.");
  }
  return response.json() as Promise<T>;
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
}
