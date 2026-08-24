import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { UserStatus } from "../../../../generated/prisma/client";
import { AdminRepository } from "./admin.repository";
import { MailService } from "../mail/mail.service";
import { createAuthToken, hashAuthToken, normalizePhone } from "../auth/auth-token.util";
import type { AdminAuditQuery, AdminClassroomQuery, AdminUserQuery } from "./admin.types";

function vietnamDayBounds(now = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs;
  return { start: new Date(start), end: new Date(start + 24 * 60 * 60 * 1000) };
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(AdminRepository) private readonly repository: AdminRepository,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

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

  async updateUserProfile(actorId: string, userId: string, input: { fullName?: string; phone?: string | null }) {
    if (input.fullName === undefined && input.phone === undefined) throw new BadRequestException("Cần cung cấp ít nhất một trường cần cập nhật.");
    const normalized: { fullName?: string; phone?: string | null } = {};
    if (input.fullName !== undefined) {
      const name = input.fullName.trim().replace(/\s+/g, " ");
      if (!name) throw new BadRequestException("Họ và tên không được để trống.");
      normalized.fullName = name;
    }
    if (input.phone !== undefined) normalized.phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
    const result = await this.repository.updateUserProfile(actorId, userId, normalized);
    if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài khoản.");
    if (result.status === "DUPLICATE_PHONE") throw new ConflictException("Số điện thoại đã được sử dụng.");
    return result.user;
  }

  async resendVerification(actorId: string, userId: string) {
    const token = createAuthToken();
    const result = await this.repository.createVerificationToken(actorId, userId, hashAuthToken(token), new Date(Date.now() + 24 * 60 * 60 * 1000));
    if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài khoản.");
    if (result.status === "ALREADY_VERIFIED") throw new ConflictException("Email của tài khoản đã được xác thực.");
    if (result.status === "DISABLED") throw new ConflictException("Không thể gửi xác thực cho tài khoản đang bị khóa.");
    await this.mail.sendVerificationEmail(result.email, token);
    return { message: `Đã gửi lại email xác thực tới ${result.email}.` };
  }

  async deleteUser(actorId: string, userId: string, reason?: string) {
    const result = await this.repository.deleteUser(actorId, userId, reason?.trim() || undefined);
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài khoản.");
    if (result === "SELF_DELETE") throw new BadRequestException("Quản trị viên không thể xóa tài khoản của chính mình.");
    if (result === "HAS_DEPENDENCIES") throw new ConflictException("Không thể xóa tài khoản vì tài khoản đã phát sinh dữ liệu học tập hoặc vận hành. Hãy khóa tài khoản thay vì xóa.");
    return { success: true };
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
