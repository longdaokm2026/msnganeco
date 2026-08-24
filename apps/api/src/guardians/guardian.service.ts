import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RequestStudentLinkDto } from "./dto/request-student-link.dto";
import type { ReviewGuardianLinkDto } from "./dto/review-guardian-link.dto";
import { GuardianRepository } from "./guardian.repository";

@Injectable()
export class GuardianService {
  constructor(@Inject(GuardianRepository) private readonly repository: GuardianRepository) {}

  async requestLink(guardianId: string, dto: RequestStudentLinkDto) {
    const result = await this.repository.requestLink(
      guardianId,
      dto.studentEmail.trim().toLowerCase(),
      dto.relationship,
    );
    if (result.status === "STUDENT_NOT_FOUND") {
      throw new NotFoundException("Không tìm thấy tài khoản học sinh đang hoạt động với email này.");
    }
    if (result.status === "SAME_USER") {
      throw new ConflictException("Không thể tự liên kết tài khoản của chính bạn.");
    }
    if (result.status === "ALREADY_PENDING") {
      throw new ConflictException("Yêu cầu liên kết đang chờ học sinh xác nhận.");
    }
    if (result.status === "ALREADY_ACTIVE") {
      throw new ConflictException("Học sinh đã được liên kết với tài khoản của bạn.");
    }
    if (result.status !== "CREATED") {
      throw new ConflictException("Không thể tạo yêu cầu liên kết.");
    }
    return result.value;
  }

  listForGuardian(guardianId: string) {
    return this.repository.listForGuardian(guardianId);
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  async reviewLink(studentId: string, guardianId: string, dto: ReviewGuardianLinkDto) {
    const result = await this.repository.reviewLink(
      studentId,
      guardianId,
      dto.decision,
      new Date(),
    );
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy yêu cầu liên kết.");
    if (result === "NOT_PENDING") throw new ConflictException("Yêu cầu liên kết đã được xử lý.");
    return { success: true, status: dto.decision === "APPROVED" ? "ACTIVE" : "REJECTED" };
  }

  async revokeByGuardian(guardianId: string, studentId: string) {
    const result = await this.repository.revokeByGuardian(guardianId, studentId, new Date());
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy liên kết đang hoạt động.");
    return { success: true };
  }

  async revokeByStudent(studentId: string, guardianId: string) {
    const result = await this.repository.revokeByStudent(studentId, guardianId, new Date());
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy liên kết đang hoạt động.");
    return { success: true };
  }

  async studentOverview(guardianId: string, studentId: string) {
    const result = await this.repository.studentOverview(guardianId, studentId, new Date());
    if (result.status === "NOT_FOUND") {
      throw new NotFoundException("Không tìm thấy học sinh hoặc bạn chưa được cấp quyền xem dữ liệu.");
    }
    return result.value;
  }
}
