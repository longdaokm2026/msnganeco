import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SessionRepository } from "./session.repository";
import type { CreateSessionDto } from "./dto/create-session.dto";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto";
import type { ReviewAbsenceDto } from "./dto/review-absence.dto";

@Injectable()
export class SessionService {
  constructor(@Inject(SessionRepository) private readonly repository: SessionRepository) {}

  async createSession(teacherId: string, classroomId: string, dto: CreateSessionDto) {
    const scheduledStart = new Date(dto.scheduledStart);
    const scheduledEnd = new Date(dto.scheduledEnd);
    if (scheduledEnd <= scheduledStart) {
      throw new BadRequestException("Giờ kết thúc phải sau giờ bắt đầu.");
    }
    const result = await this.repository.createSession(teacherId, classroomId, {
      title: dto.title.trim().replace(/\s+/g, " "),
      topic: dto.topic?.trim() || undefined,
      scheduledStart,
      scheduledEnd,
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy lớp học.");
    if (result.status === "DUPLICATE") {
      throw new ConflictException("Lớp đã có một buổi học bắt đầu vào thời gian này.");
    }
    return result.value;
  }

  async listClassSessions(teacherId: string, classroomId: string) {
    const result = await this.repository.listClassSessions(teacherId, classroomId);
    if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy lớp học.");
    return result.value;
  }

  async attendanceSheet(teacherId: string, sessionId: string) {
    const result = await this.repository.attendanceSheet(teacherId, sessionId);
    if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy buổi học.");
    return result.value;
  }

  async markAttendance(teacherId: string, sessionId: string, dto: MarkAttendanceDto) {
    const uniqueIds = new Set(dto.records.map(({ studentId }) => studentId));
    if (uniqueIds.size !== dto.records.length) {
      throw new BadRequestException("Danh sách điểm danh có học sinh bị lặp.");
    }
    const result = await this.repository.markAttendance(teacherId, sessionId, dto.records);
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy buổi học.");
    if (result === "INVALID_STUDENT") {
      throw new BadRequestException("Danh sách có học sinh không thuộc lớp.");
    }
    return { success: true };
  }

  listStudentSessions(studentId: string) {
    return this.repository.listStudentSessions(studentId, new Date());
  }

  async requestAbsence(studentId: string, sessionId: string, reason: string) {
    const result = await this.repository.requestAbsence(studentId, sessionId, reason.trim(), new Date());
    if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy buổi học.");
    if (result.status === "NOT_ENROLLED") throw new NotFoundException("Bạn không thuộc lớp học này.");
    if (result.status === "DEADLINE_PASSED") {
      throw new ConflictException("Đơn xin vắng phải được gửi trước giờ học ít nhất 2 giờ.");
    }
    if (result.status === "ALREADY_REQUESTED") {
      throw new ConflictException("Bạn đã gửi đơn xin vắng cho buổi học này.");
    }
    if (result.status !== "OK") {
      throw new ConflictException("Không thể gửi đơn xin vắng.");
    }
    return { id: result.requestId, status: "PENDING" };
  }

  async reviewAbsence(teacherId: string, requestId: string, dto: ReviewAbsenceDto) {
    const result = await this.repository.reviewAbsence(
      teacherId,
      requestId,
      dto.decision,
      dto.note,
      new Date(),
    );
    if (result === "NOT_FOUND") throw new NotFoundException("Không tìm thấy đơn xin vắng.");
    if (result === "ALREADY_REVIEWED") {
      throw new ConflictException("Đơn xin vắng đã được xử lý.");
    }
    return { success: true, status: dto.decision };
  }
}
