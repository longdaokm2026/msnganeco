import { Injectable } from "@nestjs/common";
import { AssignmentAttemptStatus, AssignmentStatus, EnrollmentStatus, Prisma, WritingTaskType } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { attemptExpired } from "./attempt-timing";
import { manualGradeComplete } from "./manual-grading";
import { WRITING_MAX_SCORE, WritingRepository, type TranslationItemInput, type WritingResult, type WritingTaskInput } from "./writing.repository";

const decimal = (value: Prisma.Decimal | number | null) => value === null ? null : typeof value === "number" ? value : value.toNumber();
export const countWritingWords = (content: string) => content.trim() ? content.trim().split(/\s+/u).length : 0;
const translationItemSelect = { id: true, position: true, sourceText: true, referenceAnswer: true, createdAt: true, updatedAt: true } satisfies Prisma.WritingTranslationItemSelect;
const writingTaskSelect = { id: true, assignmentId: true, type: true, title: true, prompt: true, instructions: true, minWords: true, maxWords: true, maxScore: true, createdAt: true, updatedAt: true, translationItems: { select: translationItemSelect, orderBy: { position: "asc" as const } } } satisfies Prisma.AssignmentWritingTaskSelect;
const answerSelect = { id: true, translationItemId: true, answerText: true, isCorrect: true, teacherComment: true, createdAt: true, updatedAt: true } satisfies Prisma.WritingTranslationAnswerSelect;
const submissionSelect = { id: true, writingTaskId: true, attemptId: true, studentId: true, essayContent: true, wordCount: true, submittedAt: true, essayScore: true, teacherFeedback: true, gradedAt: true, createdAt: true, updatedAt: true, translationAnswers: { select: answerSelect } } satisfies Prisma.WritingSubmissionSelect;

type TaskRecord = Prisma.AssignmentWritingTaskGetPayload<{ select: typeof writingTaskSelect }>;
type SubmissionRecord = Prisma.WritingSubmissionGetPayload<{ select: typeof submissionSelect }>;
const teacherTask = (task: TaskRecord) => ({ ...task, maxScore: WRITING_MAX_SCORE });
const studentTask = (task: TaskRecord) => ({ ...teacherTask(task), translationItems: task.translationItems.map((item) => ({ id: item.id, position: item.position, sourceText: item.sourceText, createdAt: item.createdAt, updatedAt: item.updatedAt })) });
const translationProgress = (task: TaskRecord, submission: SubmissionRecord | null) => {
  if (task.type === WritingTaskType.ESSAY) return null;
  const gradedCount = submission?.translationAnswers.filter((answer) => answer.isCorrect !== null).length ?? 0;
  const correctCount = submission?.translationAnswers.filter((answer) => answer.isCorrect === true).length ?? 0;
  const totalItems = task.translationItems.length;
  return { gradedCount, correctCount, totalItems, complete: totalItems > 0 && gradedCount === totalItems, percentage: totalItems > 0 && gradedCount === totalItems ? correctCount / totalItems * 100 : null };
};
const submissionView = (task: TaskRecord, submission: SubmissionRecord | null, teacher = false) => {
  if (!submission) return null;
  const answers = submission.translationAnswers.map((answer) => ({ ...answer, ...(!teacher && answer.isCorrect === null ? { teacherComment: null } : {}) }));
  return { ...submission, essayScore: decimal(submission.essayScore), translationAnswers: answers, translationResult: translationProgress(task, submission) };
};

@Injectable()
export class PrismaWritingRepository extends WritingRepository {
  private async draft(tx: Prisma.TransactionClient, teacherId: string, assignmentId: string) {
    return tx.assignment.findFirst({ where: { id: assignmentId, status: AssignmentStatus.DRAFT, classroom: { teacherId } }, select: { id: true, classroomId: true, writingTask: { select: { id: true, type: true } } } });
  }

  async upsertTask(teacherId: string, assignmentId: string, input: WritingTaskInput): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId);
      if (!assignment) return { status: "NOT_FOUND" };
      const data = { type: input.type, title: input.title?.trim() || null, prompt: input.prompt?.trim() || null, instructions: input.instructions?.trim() || null, minWords: input.type === WritingTaskType.ESSAY ? input.minWords ?? null : null, maxWords: input.type === WritingTaskType.ESSAY ? input.maxWords ?? null : null, maxScore: WRITING_MAX_SCORE };
      const task = await tx.assignmentWritingTask.upsert({ where: { assignmentId }, create: { assignmentId, ...data }, update: data, select: writingTaskSelect });
      if (input.type === WritingTaskType.ESSAY && assignment.writingTask && assignment.writingTask.type !== WritingTaskType.ESSAY) await tx.writingTranslationItem.deleteMany({ where: { writingTaskId: task.id } });
      const refreshed = await tx.assignmentWritingTask.findUniqueOrThrow({ where: { id: task.id }, select: writingTaskSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: assignment.writingTask ? "WRITING_TASK_UPDATED" : "WRITING_TASK_CREATED", entityType: "AssignmentWritingTask", entityId: task.id, metadata: { assignmentId, classroomId: assignment.classroomId, type: input.type } } });
      return { status: "OK", value: teacherTask(refreshed) };
    });
  }

  async deleteTask(teacherId: string, assignmentId: string): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId);
      if (!assignment?.writingTask) return { status: "NOT_FOUND" };
      await tx.assignmentWritingTask.delete({ where: { id: assignment.writingTask.id } });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "WRITING_TASK_UPDATED", entityType: "AssignmentWritingTask", entityId: assignment.writingTask.id, metadata: { assignmentId, classroomId: assignment.classroomId, enabled: false } } });
      return { status: "OK", value: { success: true } };
    });
  }

  async addTranslationItem(teacherId: string, assignmentId: string, input: TranslationItemInput): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId);
      if (!assignment?.writingTask || assignment.writingTask.type === WritingTaskType.ESSAY) return { status: "INVALID_STATE", message: "Hãy chọn loại bài dịch trước khi thêm câu." };
      const aggregate = await tx.writingTranslationItem.aggregate({ where: { writingTaskId: assignment.writingTask.id }, _max: { position: true } });
      const item = await tx.writingTranslationItem.create({ data: { writingTaskId: assignment.writingTask.id, position: (aggregate._max.position ?? -1) + 1, sourceText: input.sourceText.trim(), referenceAnswer: input.referenceAnswer?.trim() || null }, select: translationItemSelect });
      return { status: "OK", value: item };
    });
  }

  async updateTranslationItem(teacherId: string, assignmentId: string, itemId: string, input: TranslationItemInput): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId);
      if (!assignment?.writingTask) return { status: "NOT_FOUND" };
      const updated = await tx.writingTranslationItem.updateMany({ where: { id: itemId, writingTaskId: assignment.writingTask.id }, data: { sourceText: input.sourceText.trim(), referenceAnswer: input.referenceAnswer?.trim() || null } });
      if (!updated.count) return { status: "NOT_FOUND" };
      return { status: "OK", value: await tx.writingTranslationItem.findUnique({ where: { id: itemId }, select: translationItemSelect }) };
    });
  }

  async deleteTranslationItem(teacherId: string, assignmentId: string, itemId: string): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId);
      if (!assignment?.writingTask) return { status: "NOT_FOUND" };
      const deleted = await tx.writingTranslationItem.deleteMany({ where: { id: itemId, writingTaskId: assignment.writingTask.id } });
      return deleted.count ? { status: "OK", value: { success: true } } : { status: "NOT_FOUND" };
    });
  }

  async reorderTranslationItems(teacherId: string, assignmentId: string, ids: string[]): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await this.draft(tx, teacherId, assignmentId);
      if (!assignment?.writingTask) return { status: "NOT_FOUND" };
      const current = await tx.writingTranslationItem.findMany({ where: { writingTaskId: assignment.writingTask.id }, select: { id: true } });
      if (current.length !== ids.length || ids.some((id) => !current.some((item) => item.id === id))) return { status: "INVALID", message: "Danh sách sắp xếp câu dịch không đầy đủ." };
      for (const [index, id] of ids.entries()) await tx.writingTranslationItem.update({ where: { id }, data: { position: -1000 - index } });
      for (const [index, id] of ids.entries()) await tx.writingTranslationItem.update({ where: { id }, data: { position: index } });
      return { status: "OK", value: { success: true } };
    });
  }

  async studentTask(studentId: string, assignmentId: string): Promise<WritingResult> {
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED, AssignmentStatus.ARCHIVED] }, classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } } }, select: { writingTask: { select: writingTaskSelect } } });
    return assignment?.writingTask ? { status: "OK", value: studentTask(assignment.writingTask) } : { status: "NOT_FOUND" };
  }

  async studentAttempt(studentId: string, attemptId: string): Promise<WritingResult> {
    const attempt = await prisma.assignmentAttempt.findFirst({ where: { id: attemptId, studentId }, select: { status: true, assignment: { select: { showScoreImmediately: true, writingTask: { select: writingTaskSelect } } }, writingSubmission: { select: submissionSelect } } });
    const task = attempt?.assignment.writingTask;
    if (!attempt || !task) return { status: "NOT_FOUND" };
    const submitted = attempt.status !== AssignmentAttemptStatus.IN_PROGRESS;
    const showGrade = submitted && attempt.assignment.showScoreImmediately;
    const submission = submissionView(task, attempt.writingSubmission);
    return { status: "OK", value: { task: studentTask(task), submission: submission && !showGrade ? { ...submission, essayScore: null, teacherFeedback: null, gradedAt: null, translationAnswers: submission.translationAnswers.map((answer) => ({ ...answer, isCorrect: null, teacherComment: null })), translationResult: null } : submission, editable: !submitted } };
  }

  private async editableAttempt(tx: Prisma.TransactionClient, studentId: string, attemptId: string) {
    return tx.assignmentAttempt.findFirst({ where: { id: attemptId, studentId, status: AssignmentAttemptStatus.IN_PROGRESS }, select: { id: true, assignmentId: true, startedAt: true, assignment: { select: { timeLimitMinutes: true, writingTask: { select: writingTaskSelect } } } } });
  }

  async saveEssay(studentId: string, attemptId: string, content: string): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const attempt = await this.editableAttempt(tx, studentId, attemptId); const task = attempt?.assignment.writingTask;
      if (!attempt || !task) return { status: "NOT_FOUND" };
      if (task.type !== WritingTaskType.ESSAY) return { status: "INVALID_STATE", message: "Bài Writing này không phải Essay." };
      if (attemptExpired(attempt.startedAt, attempt.assignment.timeLimitMinutes)) return { status: "INVALID_STATE", message: "Đã hết thời gian làm bài." };
      const wordCount = countWritingWords(content);
      if (task.maxWords != null && wordCount > task.maxWords) return { status: "INVALID", message: `Bài viết vượt quá giới hạn ${task.maxWords} từ.` };
      const submission = await tx.writingSubmission.upsert({ where: { attemptId }, create: { writingTaskId: task.id, attemptId, studentId, essayContent: content, wordCount }, update: { essayContent: content, wordCount, essayScore: null, teacherFeedback: null, gradedById: null, gradedAt: null }, select: submissionSelect });
      return { status: "OK", value: submissionView(task, submission) };
    });
  }

  async saveTranslation(studentId: string, attemptId: string, itemId: string, answerText: string): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const attempt = await this.editableAttempt(tx, studentId, attemptId); const task = attempt?.assignment.writingTask;
      if (!attempt || !task) return { status: "NOT_FOUND" };
      if (task.type === WritingTaskType.ESSAY) return { status: "INVALID_STATE", message: "Bài Writing này không phải bài dịch." };
      if (attemptExpired(attempt.startedAt, attempt.assignment.timeLimitMinutes)) return { status: "INVALID_STATE", message: "Đã hết thời gian làm bài." };
      if (!task.translationItems.some((item) => item.id === itemId)) return { status: "NOT_FOUND" };
      const submission = await tx.writingSubmission.upsert({ where: { attemptId }, create: { writingTaskId: task.id, attemptId, studentId }, update: {}, select: { id: true } });
      const answer = await tx.writingTranslationAnswer.upsert({ where: { writingSubmissionId_translationItemId: { writingSubmissionId: submission.id, translationItemId: itemId } }, create: { writingSubmissionId: submission.id, translationItemId: itemId, answerText }, update: { answerText, isCorrect: null, teacherComment: null }, select: answerSelect });
      return { status: "OK", value: answer };
    });
  }

  private async updateAttemptGradeState(tx: Prisma.TransactionClient, attemptId: string) {
    const attempt = await tx.assignmentAttempt.findUnique({ where: { id: attemptId }, select: { assignment: { select: { readAloudTask: { select: { id: true } }, writingTask: { select: { type: true, translationItems: { select: { id: true } } } } } }, readAloudSubmission: { select: { score: true } }, writingSubmission: { select: { essayScore: true, translationAnswers: { select: { isCorrect: true } } } } } });
    if (!attempt) return;
    const complete = manualGradeComplete({ hasReadAloud: Boolean(attempt.assignment.readAloudTask), readAloudScore: decimal(attempt.readAloudSubmission?.score ?? null), writingType: attempt.assignment.writingTask?.type ?? null, essayScore: decimal(attempt.writingSubmission?.essayScore ?? null), translationItemCount: attempt.assignment.writingTask?.translationItems.length ?? 0, translationGrades: attempt.writingSubmission?.translationAnswers.map((answer) => answer.isCorrect) ?? [] });
    await tx.assignmentAttempt.update({ where: { id: attemptId }, data: { status: complete ? AssignmentAttemptStatus.FULLY_GRADED : AssignmentAttemptStatus.PENDING_MANUAL_GRADE } });
  }

  async gradeEssay(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.writingSubmission.findFirst({ where: { id: submissionId, submittedAt: { not: null }, writingTask: { assignmentId, type: WritingTaskType.ESSAY, assignment: { classroom: { teacherId } } } }, select: { attemptId: true, studentId: true } });
      if (!item) return { status: "NOT_FOUND" };
      if (score < 0 || score > WRITING_MAX_SCORE) return { status: "INVALID", message: "Điểm Essay phải từ 0 đến 10." };
      const now = new Date();
      const submission = await tx.writingSubmission.update({ where: { id: submissionId }, data: { essayScore: score, teacherFeedback: feedback?.trim() || null, gradedById: teacherId, gradedAt: now }, select: submissionSelect });
      await this.updateAttemptGradeState(tx, item.attemptId);
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ESSAY_GRADED", entityType: "WritingSubmission", entityId: submissionId, metadata: { assignmentId, attemptId: item.attemptId, studentId: item.studentId, score, maxScore: WRITING_MAX_SCORE } } });
      const task = await tx.assignmentWritingTask.findUniqueOrThrow({ where: { id: submission.writingTaskId }, select: writingTaskSelect });
      return { status: "OK", value: submissionView(task, submission, true) };
    });
  }

  async gradeTranslation(teacherId: string, assignmentId: string, submissionId: string, answerId: string, isCorrect: boolean, teacherComment?: string | null): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.writingTranslationAnswer.findFirst({ where: { id: answerId, writingSubmissionId: submissionId, writingSubmission: { submittedAt: { not: null }, writingTask: { assignmentId, type: { in: [WritingTaskType.TRANSLATION_VI_EN, WritingTaskType.TRANSLATION_EN_VI] }, assignment: { classroom: { teacherId } } } } }, select: { writingSubmission: { select: { attemptId: true, studentId: true, writingTaskId: true } } } });
      if (!item) return { status: "NOT_FOUND" };
      await tx.writingTranslationAnswer.update({ where: { id: answerId }, data: { isCorrect, teacherComment: teacherComment?.trim() || null }, select: { id: true } });
      const task = await tx.assignmentWritingTask.findUniqueOrThrow({ where: { id: item.writingSubmission.writingTaskId }, select: writingTaskSelect });
      const submission = await tx.writingSubmission.findUniqueOrThrow({ where: { id: submissionId }, select: submissionSelect });
      const progress = translationProgress(task, submission);
      const updatedSubmission = await tx.writingSubmission.update({ where: { id: submissionId }, data: { gradedById: teacherId, gradedAt: progress?.complete ? new Date() : null }, select: submissionSelect });
      await this.updateAttemptGradeState(tx, item.writingSubmission.attemptId);
      if (progress?.complete) await tx.auditLog.create({ data: { actorId: teacherId, action: "TRANSLATION_GRADED", entityType: "WritingSubmission", entityId: submissionId, metadata: { assignmentId, attemptId: item.writingSubmission.attemptId, studentId: item.writingSubmission.studentId, correctCount: progress.correctCount, totalItems: progress.totalItems } } });
      return { status: "OK", value: submissionView(task, updatedSubmission, true) };
    });
  }

  async saveFeedback(teacherId: string, assignmentId: string, submissionId: string, feedback?: string | null): Promise<WritingResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.writingSubmission.findFirst({ where: { id: submissionId, submittedAt: { not: null }, writingTask: { assignmentId, assignment: { classroom: { teacherId } } } }, select: { id: true, writingTaskId: true } });
      if (!item) return { status: "NOT_FOUND" };
      const submission = await tx.writingSubmission.update({ where: { id: submissionId }, data: { teacherFeedback: feedback?.trim() || null }, select: submissionSelect });
      const task = await tx.assignmentWritingTask.findUniqueOrThrow({ where: { id: item.writingTaskId }, select: writingTaskSelect });
      return { status: "OK", value: submissionView(task, submission, true) };
    });
  }
}
