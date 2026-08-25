import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Role } from "../../../../generated/prisma/client";
import { validateQuestion } from "../assignments/grading";
import { QuickQuizRepository } from "./quick-quiz.repository";
import type { QuickQuizRepositoryResult, QuickQuizSaveInput, QuickQuizSource } from "./quiz-generation.types";
import { toPersistedQuestion } from "./quiz-generation.validator";
import { QuizGenerationService } from "./quiz-generation.service";
import { VocabularySourceMode, type QuickQuizDto } from "./quick-quiz.dto";
import { uniqueVocabulary } from "./vocabulary-parser";

@Injectable()
export class QuickQuizService {
  constructor(private readonly repository: QuickQuizRepository, private readonly generation: QuizGenerationService) {}
  private value<T>(result: QuickQuizRepositoryResult<T>) {
    if (result.status === "OK") return result.value;
    if (result.status === "NOT_FOUND") throw new NotFoundException(result.message ?? "Không tìm thấy lớp học hoặc Quick Quiz.");
    if (result.status === "INVALID_STATE") throw new ConflictException(result.message ?? "Không thể tạo lại Quick Quiz ở trạng thái hiện tại.");
    throw new BadRequestException(result.message ?? "Dữ liệu Quick Quiz không hợp lệ.");
  }
  private source(input: QuickQuizDto): QuickQuizSource {
    return input.sourceMode === VocabularySourceMode.SELECTED ? { mode: "SELECTED", lessonIds: input.lessonIds! } : { mode: "RECENT", recentLessons: input.recentLessons ?? 3 };
  }
  private async prepare(teacherId: string, input: QuickQuizDto): Promise<{ save: QuickQuizSaveInput; message: string }> {
    const lessons = this.value(await this.repository.sourceLessons(teacherId, input.classroomId, this.source(input)));
    const vocabulary = uniqueVocabulary(lessons);
    if (!vocabulary.length) throw new BadRequestException("Không tìm thấy từ vựng có cấu trúc word | meaning | example trong các buổi học đã chọn.");
    const target = Math.min(input.questionCount, vocabulary.length);
    const generated = await this.generation.generate(vocabulary, target);
    if (generated.questions.length !== target) throw new BadRequestException("Không đủ dữ liệu từ vựng hợp lệ để tạo Quick Quiz.");
    const questions = generated.questions.map(toPersistedQuestion);
    for (const question of questions) { const error = validateQuestion(question); if (error) throw new BadRequestException(error); }
    const sourceLabel = input.sourceMode === VocabularySourceMode.SELECTED ? `${lessons.length} buổi được chọn` : `${lessons.length} buổi gần nhất`;
    const limited = vocabulary.length < input.questionCount ? `Chỉ tìm thấy ${vocabulary.length} từ vựng trong ${sourceLabel}. Quiz sẽ được tạo với ${target} câu.` : `Tìm thấy ${vocabulary.length} từ vựng từ ${sourceLabel} và đã tạo ${target} câu.`;
    const fallback = generated.mode === "LOCAL" ? " Quiz đã được tạo bằng chế độ nội bộ." : " Quiz đã được tạo bằng AI.";
    return { save: { classroomId: input.classroomId, title: input.title?.trim() || "Quick Quiz từ vựng", maxAttempts: input.maxAttempts, timeLimitMinutes: input.timeLimitMinutes ?? null, showLeaderboard: input.showLeaderboard, sourceLessonIds: lessons.map((lesson) => lesson.id), sourceWordCount: vocabulary.length, generationMode: generated.mode, generationModel: generated.model, questions }, message: limited + fallback };
  }
  async create(teacherId: string, input: QuickQuizDto) {
    const prepared = await this.prepare(teacherId, input);
    const saved = this.value(await this.repository.create(teacherId, prepared.save));
    return { ...saved, generationMode: prepared.save.generationMode, sourceWordCount: prepared.save.sourceWordCount, questionCount: prepared.save.questions.length, message: prepared.message };
  }
  async regenerate(teacherId: string, assignmentId: string, input: QuickQuizDto) {
    const prepared = await this.prepare(teacherId, input);
    const saved = this.value(await this.repository.regenerate(teacherId, assignmentId, prepared.save));
    return { ...saved, generationMode: prepared.save.generationMode, sourceWordCount: prepared.save.sourceWordCount, questionCount: prepared.save.questions.length, message: prepared.message };
  }
  async leaderboard(userId: string, roles: Role[], assignmentId: string) { return this.value(await this.repository.leaderboard(userId, roles, assignmentId)); }
}
