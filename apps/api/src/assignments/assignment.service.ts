import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { validateQuestion } from "./grading";
import { AssignmentRepository } from "./assignment.repository";
import type { AssignmentInput, AssignmentListQuery, AssignmentPatch, AnswerInput, PassageInput, QuestionInput, ReorderInput, RepositoryResult } from "./assignment.types";

@Injectable()
export class AssignmentService {
  constructor(@Inject(AssignmentRepository) private readonly repository: AssignmentRepository) {}
  private value(result: RepositoryResult) {
    if (result.status === "OK") return result.value;
    if (result.status === "NOT_FOUND") throw new NotFoundException(result.message ?? "Không tìm thấy bài tập hoặc bạn không có quyền truy cập.");
    if (result.status === "FORBIDDEN") throw new ForbiddenException(result.message ?? "Bạn không có quyền thực hiện thao tác này.");
    if (result.status === "LIMIT" || result.status === "DUE" || result.status === "INVALID_STATE") throw new ConflictException(result.message ?? "Không thể thực hiện thao tác ở trạng thái hiện tại.");
    throw new BadRequestException(result.message ?? "Dữ liệu bài tập không hợp lệ.");
  }
  listTeacher(teacherId: string, query: AssignmentListQuery) { return this.repository.listTeacher(teacherId, query); }
  async create(teacherId: string, input: AssignmentInput) { return this.value(await this.repository.create(teacherId, { ...input, title: input.title.trim() })); }
  async teacherDetail(teacherId: string, id: string) { return this.value(await this.repository.teacherDetail(teacherId, id)); }
  async update(teacherId: string, id: string, input: AssignmentPatch) { return this.value(await this.repository.update(teacherId, id, input)); }
  async transition(teacherId: string, id: string, action: "publish" | "close" | "archive") { return this.value(await this.repository.transition(teacherId, id, action)); }
  async delete(teacherId: string, id: string) { return this.value(await this.repository.delete(teacherId, id)); }
  async addQuestion(teacherId: string, id: string, input: QuestionInput) { const error = validateQuestion(input); if (error) throw new BadRequestException(error); return this.value(await this.repository.addQuestion(teacherId, id, { ...input, prompt: input.prompt.trim(), explanation: input.explanation?.trim() || null })); }
  async updateQuestion(teacherId: string, id: string, questionId: string, input: QuestionInput) { const error = validateQuestion(input); if (error) throw new BadRequestException(error); return this.value(await this.repository.updateQuestion(teacherId, id, questionId, { ...input, prompt: input.prompt.trim(), explanation: input.explanation?.trim() || null })); }
  async deleteQuestion(teacherId: string, id: string, questionId: string) { return this.value(await this.repository.deleteQuestion(teacherId, id, questionId)); }
  async reorderQuestions(teacherId: string, id: string, input: ReorderInput) { return this.value(await this.repository.reorderQuestions(teacherId, id, input)); }
  async addPassage(teacherId: string, id: string, input: PassageInput) { return this.value(await this.repository.addPassage(teacherId, id, input)); }
  async updatePassage(teacherId: string, id: string, passageId: string, input: PassageInput) { return this.value(await this.repository.updatePassage(teacherId, id, passageId, input)); }
  async deletePassage(teacherId: string, id: string, passageId: string) { return this.value(await this.repository.deletePassage(teacherId, id, passageId)); }
  async reorderPassages(teacherId: string, id: string, input: ReorderInput) { return this.value(await this.repository.reorderPassages(teacherId, id, input)); }
  async results(teacherId: string, id: string) { return this.value(await this.repository.results(teacherId, id)); }
  async studentResults(teacherId: string, id: string, studentId: string) { return this.value(await this.repository.studentResults(teacherId, id, studentId)); }
  async teacherAttempt(teacherId: string, id: string, attemptId: string) { return this.value(await this.repository.teacherAttempt(teacherId, id, attemptId)); }
  listStudent(studentId: string, query: AssignmentListQuery) { return this.repository.listStudent(studentId, query); }
  async studentDetail(studentId: string, id: string) { return this.value(await this.repository.studentDetail(studentId, id)); }
  async startAttempt(studentId: string, id: string) { return this.value(await this.repository.startAttempt(studentId, id)); }
  async studentAttempt(studentId: string, id: string, resultOnly = false) { return this.value(await this.repository.studentAttempt(studentId, id, resultOnly)); }
  async saveAnswer(studentId: string, id: string, questionId: string, input: AnswerInput) { return this.value(await this.repository.saveAnswer(studentId, id, questionId, input)); }
  async submit(studentId: string, id: string) { return this.value(await this.repository.submit(studentId, id)); }
}

