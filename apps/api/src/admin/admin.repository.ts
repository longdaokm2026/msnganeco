import type { UserStatus } from "../../../../generated/prisma/client";
import type {
  AdminAuditQuery,
  AdminClassroomQuery,
  AdminOverview,
  AdminUserQuery,
  Page,
  TeacherReviewResult,
  UserStatusResult,
} from "./admin.types";

export abstract class AdminRepository {
  abstract overview(dayStart: Date, dayEnd: Date): Promise<AdminOverview>;
  abstract listUsers(query: AdminUserQuery): Promise<Page<unknown>>;
  abstract userDetail(userId: string): Promise<unknown | null>;
  abstract updateUserStatus(actorId: string, userId: string, status: UserStatus): Promise<UserStatusResult>;
  abstract pendingTeachers(page: number, pageSize: number): Promise<Page<unknown>>;
  abstract reviewTeacher(
    actorId: string,
    userId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string,
  ): Promise<TeacherReviewResult>;
  abstract listClassrooms(query: AdminClassroomQuery): Promise<Page<unknown>>;
  abstract classroomDetail(classroomId: string, now: Date): Promise<unknown | null>;
  abstract listAuditLogs(query: AdminAuditQuery): Promise<Page<unknown>>;
}
