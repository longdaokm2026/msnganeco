import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Role } from "../../../../generated/prisma/client";
import { ReadAloudStorageService, type AudioUploadFile } from "./read-aloud-storage.service";
import { ReadAloudRepository, type ReadAloudResult, type ReadAloudTaskInput } from "./read-aloud.repository";

@Injectable()
export class ReadAloudService {
  constructor(@Inject(ReadAloudRepository) private readonly repository: ReadAloudRepository, @Inject(ReadAloudStorageService) private readonly storage: ReadAloudStorageService) {}
  private value(result: ReadAloudResult) {
    if (result.status === "OK") return result.value;
    if (result.status === "NOT_FOUND") throw new NotFoundException(result.message ?? "Không tìm thấy bài đọc ghi âm hoặc bạn không có quyền truy cập.");
    if (result.status === "FORBIDDEN") throw new ForbiddenException(result.message ?? "Bạn không có quyền thực hiện thao tác này.");
    if (result.status === "INVALID_STATE") throw new ConflictException(result.message ?? "Không thể thực hiện thao tác ở trạng thái hiện tại.");
    throw new BadRequestException(result.message ?? "Dữ liệu bài đọc ghi âm không hợp lệ.");
  }
  upsertTask(teacherId: string, assignmentId: string, input: ReadAloudTaskInput) { return this.repository.upsertTask(teacherId, assignmentId, { ...input, readingText: input.readingText.trim() }).then((result) => this.value(result)); }
  deleteTask(teacherId: string, assignmentId: string) { return this.repository.deleteTask(teacherId, assignmentId).then((result) => this.value(result)); }
  studentTask(studentId: string, assignmentId: string) { return this.repository.studentTask(studentId, assignmentId).then((result) => this.value(result)); }
  results(teacherId: string, assignmentId: string) { return this.repository.results(teacherId, assignmentId).then((result) => this.value(result)); }
  grade(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null) { return this.repository.grade(teacherId, assignmentId, submissionId, score, feedback).then((result) => this.value(result)); }

  async upload(studentId: string, attemptId: string, file: AudioUploadFile | undefined, durationSeconds?: number | null) {
    if (!file) throw new BadRequestException("Vui lòng chọn bản ghi âm.");
    const saved = await this.storage.save(file, "speaking");
    let result;
    try {
      result = await this.repository.saveUpload(studentId, attemptId, { fileName: file.originalname, fileType: saved.mime, fileSize: file.size, storageKey: saved.storageKey, durationSeconds });
    } catch (error) {
      await this.storage.remove(saved.storageKey);
      throw error;
    }
    if (result.status !== "OK") { await this.storage.remove(saved.storageKey); return this.value(result); }
    if (result.value.oldStorageKey) await this.storage.remove(result.value.oldStorageKey);
    return result.value.submission;
  }

  async audio(userId: string, roles: Role[], submissionId: string) {
    const record = await this.repository.audio(userId, roles, submissionId);
    if (!record) throw new NotFoundException("Không tìm thấy bản ghi hoặc bạn không có quyền nghe.");
    return { ...record, contents: await this.storage.read(record.storageKey) };
  }
  async audioForAttempt(studentId: string, attemptId: string) {
    const record = await this.repository.audioForAttempt(studentId, attemptId);
    if (!record) throw new NotFoundException("Chưa có bản ghi cho lượt làm bài này.");
    return { ...record, contents: await this.storage.read(record.storageKey) };
  }
}
