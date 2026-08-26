import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { WritingTaskType } from "../../../../generated/prisma/client";
import { WritingRepository, type TranslationItemInput, type WritingResult, type WritingTaskInput } from "./writing.repository";

@Injectable()
export class WritingService {
  constructor(@Inject(WritingRepository) private readonly repository: WritingRepository) {}
  private value(result: WritingResult) {
    if (result.status === "OK") return result.value;
    if (result.status === "NOT_FOUND") throw new NotFoundException(result.message ?? "Không tìm thấy bài Writing hoặc bạn không có quyền truy cập.");
    if (result.status === "FORBIDDEN") throw new ForbiddenException(result.message ?? "Bạn không có quyền thực hiện thao tác này.");
    if (result.status === "INVALID_STATE") throw new ConflictException(result.message ?? "Không thể thực hiện thao tác ở trạng thái hiện tại.");
    throw new BadRequestException(result.message ?? "Dữ liệu Writing không hợp lệ.");
  }
  upsertTask(teacherId: string, assignmentId: string, input: WritingTaskInput) {
    if (input.type === WritingTaskType.ESSAY && !input.prompt?.trim()) throw new BadRequestException("Đề bài Essay là bắt buộc.");
    if (input.minWords != null && input.maxWords != null && input.maxWords < input.minWords) throw new BadRequestException("Số từ tối đa phải lớn hơn hoặc bằng số từ tối thiểu.");
    return this.repository.upsertTask(teacherId, assignmentId, input).then((result) => this.value(result));
  }
  deleteTask(teacherId: string, assignmentId: string) { return this.repository.deleteTask(teacherId, assignmentId).then((result) => this.value(result)); }
  addItem(teacherId: string, assignmentId: string, input: TranslationItemInput) { return this.repository.addTranslationItem(teacherId, assignmentId, input).then((result) => this.value(result)); }
  updateItem(teacherId: string, assignmentId: string, itemId: string, input: TranslationItemInput) { return this.repository.updateTranslationItem(teacherId, assignmentId, itemId, input).then((result) => this.value(result)); }
  deleteItem(teacherId: string, assignmentId: string, itemId: string) { return this.repository.deleteTranslationItem(teacherId, assignmentId, itemId).then((result) => this.value(result)); }
  reorderItems(teacherId: string, assignmentId: string, ids: string[]) { return this.repository.reorderTranslationItems(teacherId, assignmentId, ids).then((result) => this.value(result)); }
  studentTask(studentId: string, assignmentId: string) { return this.repository.studentTask(studentId, assignmentId).then((result) => this.value(result)); }
  studentAttempt(studentId: string, attemptId: string) { return this.repository.studentAttempt(studentId, attemptId).then((result) => this.value(result)); }
  saveEssay(studentId: string, attemptId: string, content: string) { return this.repository.saveEssay(studentId, attemptId, content).then((result) => this.value(result)); }
  saveTranslation(studentId: string, attemptId: string, itemId: string, answerText: string) { return this.repository.saveTranslation(studentId, attemptId, itemId, answerText).then((result) => this.value(result)); }
  gradeEssay(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null) { return this.repository.gradeEssay(teacherId, assignmentId, submissionId, score, feedback).then((result) => this.value(result)); }
  gradeTranslation(teacherId: string, assignmentId: string, submissionId: string, answerId: string, isCorrect: boolean, teacherComment?: string | null) { return this.repository.gradeTranslation(teacherId, assignmentId, submissionId, answerId, isCorrect, teacherComment).then((result) => this.value(result)); }
  saveFeedback(teacherId: string, assignmentId: string, submissionId: string, feedback?: string | null) { return this.repository.saveFeedback(teacherId, assignmentId, submissionId, feedback).then((result) => this.value(result)); }
}
