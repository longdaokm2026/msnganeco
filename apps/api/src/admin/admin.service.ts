import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { UserStatus } from "../../../../generated/prisma/client";
import { AdminRepository } from "./admin.repository";
import type { AdminAuditQuery, AdminClassroomQuery, AdminUserQuery } from "./admin.types";

function vietnamDayBounds(now = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs;
  return { start: new Date(start), end: new Date(start + 24 * 60 * 60 * 1000) };
}

@Injectable()
export class AdminService {
  constructor(@Inject(AdminRepository) private readonly repository: AdminRepository) {}

  overview(now = new Date()) {
    const { start, end } = vietnamDayBounds(now);
    return this.repository.overview(start, end);
  }

  listUsers(query: AdminUserQuery) { return this.repository.listUsers(query); }

  async userDetail(userId: string) {
    const user = await this.repository.userDetail(userId);
    if (!user) throw new NotFoundException("Không tìm thấy tài khoản.");
    return user;
  }

  async updateUserStatus(actorId: string, userId: string, status: UserStatus) {
    const result = await this.repository.updateUserStatus(actorId, userId, status);
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài khoản.");
    if (result === "SELF_DISABLED") throw new BadRequestException("Quản trị viên không thể khóa tài khoản của chính mình.");
    return { userId, status };
  }

  pendingTeachers(page: number, pageSize: number) {
    return this.repository.pendingTeachers(page, pageSize);
  }

  async reviewTeacher(actorId: string, userId: string, decision: "APPROVED" | "REJECTED", note?: string) {
    const result = await this.repository.reviewTeacher(actorId, userId, decision, note);
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài khoản giáo viên.");
    if (result === "ALREADY_REVIEWED") throw new ConflictException("Hồ sơ giáo viên đã được xử lý.");
    return { userId, approvalStatus: decision };
  }

  listClassrooms(query: AdminClassroomQuery) { return this.repository.listClassrooms(query); }

  async classroomDetail(classroomId: string) {
    const classroom = await this.repository.classroomDetail(classroomId, new Date());
    if (!classroom) throw new NotFoundException("Không tìm thấy lớp học.");
    return classroom;
  }

  listAuditLogs(query: AdminAuditQuery) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException("Khoảng ngày nhật ký không hợp lệ.");
    }
    return this.repository.listAuditLogs(query);
  }
}
