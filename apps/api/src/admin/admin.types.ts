import type { ClassroomStatus, Role, UserStatus } from "../../../../generated/prisma/client";

export type Pagination = { page: number; pageSize: number };
export type Page<T> = Pagination & { items: T[]; total: number; totalPages: number };

export type AdminOverview = {
  users: { total: number; active: number; pendingVerification: number; disabled: number };
  roles: Record<Role, number>;
  teachers: { active: number; pending: number };
  classrooms: { total: number; active: number };
  registrationsToday: number;
};

export type AdminUserQuery = Pagination & { search?: string; role?: Role; status?: UserStatus };
export type AdminClassroomQuery = Pagination & {
  search?: string;
  teacherId?: string;
  status?: ClassroomStatus;
};
export type AdminAuditQuery = Pagination & {
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
};

export type UserStatusResult = "UPDATED" | "NOT_FOUND" | "SELF_DISABLED";
export type TeacherReviewResult = "UPDATED" | "NOT_FOUND" | "ALREADY_REVIEWED";
