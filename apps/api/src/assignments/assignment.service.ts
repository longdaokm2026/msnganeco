import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AssignmentDocumentService } from "./assignment-document.service";
import type { DocumentAssignment, DocumentQuestion } from "./assignment-document.types";
import type { AudioUploadFile } from "./assignment-audio-storage.service";
import { validateQuestion } from "./grading";
import { AssignmentRepository } from "./assignment.repository";
import type { AssignmentInput, AssignmentListQuery, AssignmentPatch, AnswerInput, PassageInput, QuestionInput, ReorderInput, RepositoryResult } from "./assignment.types";

@Injectable()
export class AssignmentService {
  constructor(@Inject(AssignmentRepository) private readonly repository: AssignmentRepository, @Inject(AssignmentDocumentService) private readonly documents: AssignmentDocumentService) {}
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

  docxTemplate() { return this.documents.createTemplate(); }

  async exportDocx(teacherId: string, id: string) {
    const detail = await this.value(await this.repository.teacherDetail(teacherId, id)) as {
      title: string; description: string | null; type: DocumentAssignment["type"]; maxAttempts: number; timeLimitMinutes: number | null;
      passages: Array<{ id: string; title: string | null; content: string }>;
      questions: Array<{ type: DocumentQuestion["type"]; section: DocumentQuestion["section"]; prompt: string; explanation: string | null; points: number; config: Record<string, unknown>; passageId: string | null }>;
      writingTask: { type: DocumentAssignment["writing"] extends null ? never : NonNullable<DocumentAssignment["writing"]>["type"]; prompt: string | null; minWords: number | null; translationItems?: Array<{ sourceText: string }> } | null;
    };
    const numberByPassageId = new Map(detail.passages.map((passage, index) => [passage.id, index + 1]));
    return this.documents.exportAssignment({
      title: detail.title, description: detail.description, type: detail.type,
      maxAttempts: detail.maxAttempts, timeLimitMinutes: detail.timeLimitMinutes,
      passages: detail.passages.map((passage, index) => ({ number: index + 1, title: passage.title, content: passage.content })),
      questions: detail.questions.map((question) => ({ type: question.type, section: question.section, prompt: question.prompt, explanation: question.explanation, points: Number(question.points), config: question.config, passageNumber: question.passageId ? numberByPassageId.get(question.passageId) ?? null : null })),
      writing: detail.writingTask ? { type: detail.writingTask.type, prompt: detail.writingTask.prompt, minWords: detail.writingTask.minWords, translationItems: (detail.writingTask.translationItems ?? []).map((item) => item.sourceText) } : null,
    });
  }

  async importPreview(file: AudioUploadFile | undefined) { return this.documents.parseImport(file); }

  async importDocx(teacherId: string, id: string, file: AudioUploadFile | undefined) {
    const preview = await this.documents.parseImport(file);
    for (const question of preview.questions) {
      const error = validateQuestion({ type: question.type, section: question.section, prompt: question.prompt, explanation: question.explanation, points: question.points, required: true, config: question.config, passageId: null, listeningTrackId: null });
      if (error) throw new BadRequestException(`Câu “${question.prompt.slice(0, 40)}”: ${error}`);
    }
    const saved = await this.value(await this.repository.importDocument(teacherId, id, preview));
    return { assignment: saved, warnings: preview.warnings, questionCount: preview.questions.length, passageCount: preview.passages.length, totalPoints: preview.totalPoints };
  }
}

