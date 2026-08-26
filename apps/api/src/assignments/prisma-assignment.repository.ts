import { Injectable } from "@nestjs/common";
import { AssignmentAttemptStatus, AssignmentGenerationMode, AssignmentStatus, EnrollmentStatus, Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { gradeQuestion, studentConfig } from "./grading";
import { assignmentPublishError, missingRequiredReadAloud } from "./manual-grading";
import { READ_ALOUD_MAX_SCORE } from "./read-aloud.repository";
import { humanReadableQuestionResult, objectiveResult } from "./result-view";
import { attemptDurationMs, attemptExpired } from "./attempt-timing";
import { AssignmentRepository } from "./assignment.repository";
import type { AssignmentInput, AssignmentListQuery, AssignmentPatch, AnswerInput, PassageInput, QuestionInput, ReorderInput, RepositoryResult } from "./assignment.types";

const classroomSelect = { id: true, code: true, name: true, _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } } } satisfies Prisma.ClassroomSelect;
const lessonSelect = { id: true, title: true, session: { select: { id: true, scheduledStart: true } } } satisfies Prisma.LessonSelect;
const questionSelect = { id: true, passageId: true, type: true, section: true, position: true, prompt: true, explanation: true, points: true, required: true, config: true, createdAt: true, updatedAt: true } satisfies Prisma.AssignmentQuestionSelect;
const passageSelect = { id: true, title: true, content: true, position: true, createdAt: true, updatedAt: true } satisfies Prisma.AssignmentPassageSelect;
const readAloudTaskSelect = { id: true, title: true, readingText: true, instructions: true, maxScore: true, maxDurationSeconds: true, createdAt: true, updatedAt: true } satisfies Prisma.AssignmentReadAloudTaskSelect;
const submissionAttemptSelect = { id: true, durationSeconds: true, submittedAt: true, score: true, feedback: true, gradedAt: true, audioAttachment: { select: { fileName: true, fileType: true, fileSize: true } } } satisfies Prisma.AssignmentReadAloudSubmissionSelect;
const writingTaskSelect = { id: true, type: true, title: true, prompt: true, instructions: true, minWords: true, maxWords: true, maxScore: true, translationItems: { select: { id: true, position: true, sourceText: true, referenceAnswer: true }, orderBy: { position: "asc" as const } } } satisfies Prisma.AssignmentWritingTaskSelect;
const writingSubmissionSelect = { id: true, essayContent: true, wordCount: true, submittedAt: true, essayScore: true, teacherFeedback: true, gradedAt: true, translationAnswers: { select: { id: true, translationItemId: true, answerText: true, isCorrect: true, teacherComment: true } } } satisfies Prisma.WritingSubmissionSelect;
const assignmentSelect = {
  id: true, classroomId: true, lessonId: true, title: true, description: true, type: true, status: true, dueAt: true,
  allowLateSubmission: true, maxAttempts: true, timeLimitMinutes: true, shuffleQuestions: true, shuffleOptions: true,
  showScoreImmediately: true, showAnswersAfterSubmit: true, showLeaderboard: true, generationMode: true, generationModel: true, sourceLessonIds: true, publishedAt: true, closedAt: true, createdAt: true, updatedAt: true,
  classroom: { select: classroomSelect }, lesson: { select: lessonSelect },
  readAloudTask: { select: readAloudTaskSelect },
  writingTask: { select: writingTaskSelect },
  passages: { select: passageSelect, orderBy: { position: "asc" as const } }, questions: { select: questionSelect, orderBy: { position: "asc" as const } },
  _count: { select: { attempts: true } },
} satisfies Prisma.AssignmentSelect;

type TeacherAssignment = Prisma.AssignmentGetPayload<{ select: typeof assignmentSelect }>;
const decimal = (value: { toNumber(): number } | number | null) => value === null ? null : typeof value === "number" ? value : value.toNumber();
const teacherQuestion = (item: TeacherAssignment["questions"][number]) => ({ ...item, points: decimal(item.points) });
const writingSubmissionView = (task: TeacherAssignment["writingTask"], submission: Prisma.WritingSubmissionGetPayload<{ select: typeof writingSubmissionSelect }> | null, revealGrade = true) => {
  if (!task || !submission) return null;
  const gradedCount = submission.translationAnswers.filter((answer) => answer.isCorrect !== null).length;
  const correctCount = submission.translationAnswers.filter((answer) => answer.isCorrect === true).length;
  const totalItems = task.translationItems.length;
  const answers = submission.translationAnswers.map((answer) => revealGrade ? answer : { ...answer, isCorrect: null, teacherComment: null });
  return { ...submission, essayScore: revealGrade ? decimal(submission.essayScore) : null, teacherFeedback: revealGrade ? submission.teacherFeedback : null, gradedAt: revealGrade ? submission.gradedAt : null, translationAnswers: answers, translationResult: !revealGrade || task.type === "ESSAY" ? null : { gradedCount, correctCount, totalItems, complete: totalItems > 0 && gradedCount === totalItems, percentage: totalItems > 0 && gradedCount === totalItems ? correctCount / totalItems * 100 : null } };
};
const teacherAssignment = (item: TeacherAssignment) => ({ ...item, classroom: { id: item.classroom.id, code: item.classroom.code, name: item.classroom.name }, questions: item.questions.map(teacherQuestion), readAloudTask: item.readAloudTask ? { ...item.readAloudTask, maxScore: READ_ALOUD_MAX_SCORE } : null, writingTask: item.writingTask ? { ...item.writingTask, maxScore: 10 } : null, attemptCount: item._count.attempts, assignedStudentCount: item.classroom._count.enrollments, _count: undefined });
const studentQuestion = (item: TeacherAssignment["questions"][number], reveal = false) => ({ id: item.id, passageId: item.passageId, type: item.type, section: item.section, position: item.position, prompt: item.prompt, points: decimal(item.points), required: item.required, config: studentConfig(item.type, item.config), ...(reveal ? { explanation: item.explanation } : {}) });
const studentAssignment = (item: TeacherAssignment, reveal = false) => ({ id: item.id, classroomId: item.classroomId, lessonId: item.lessonId, title: item.title, description: item.description, type: item.type, status: item.status, dueAt: item.dueAt, allowLateSubmission: item.allowLateSubmission, maxAttempts: item.maxAttempts, timeLimitMinutes: item.timeLimitMinutes, showScoreImmediately: item.showScoreImmediately, showAnswersAfterSubmit: item.showAnswersAfterSubmit, showLeaderboard: item.showLeaderboard, generationMode: item.generationMode, publishedAt: item.publishedAt, classroom: { id: item.classroom.id, code: item.classroom.code, name: item.classroom.name }, lesson: item.lesson, readAloudTask: item.readAloudTask ? { ...item.readAloudTask, maxScore: READ_ALOUD_MAX_SCORE } : null, writingTask: item.writingTask ? { ...item.writingTask, maxScore: 10, translationItems: item.writingTask.translationItems.map((translationItem) => ({ id: translationItem.id, position: translationItem.position, sourceText: translationItem.sourceText })) } : null, passages: item.passages, questions: item.questions.map((question) => studentQuestion(question, reveal)) });
const submittedStatuses = [AssignmentAttemptStatus.SUBMITTED, AssignmentAttemptStatus.AUTO_GRADED, AssignmentAttemptStatus.PENDING_MANUAL_GRADE, AssignmentAttemptStatus.FULLY_GRADED];
const page = (items: unknown[], total: number, query: AssignmentListQuery) => ({ items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) });
const assignmentData = (input: AssignmentInput | AssignmentPatch) => ({ ...input, title: input.title?.trim(), description: input.description?.trim() || null, dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null });

@Injectable()
export class PrismaAssignmentRepository extends AssignmentRepository {
  async listTeacher(teacherId: string, query: AssignmentListQuery) {
    const where: Prisma.AssignmentWhereInput = { classroom: { teacherId }, ...(query.classroomId ? { classroomId: query.classroomId } : {}), ...(query.lessonId ? { lessonId: query.lessonId } : {}), ...(query.type ? { type: query.type } : {}), ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.assignment.findMany({ where, select: assignmentSelect, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.assignment.count({ where }),
    ]);
    const submitted = rows.length ? await prisma.assignmentAttempt.findMany({ where: { assignmentId: { in: rows.map((row) => row.id) }, status: { in: submittedStatuses } }, distinct: ["assignmentId", "studentId"], select: { assignmentId: true, studentId: true } }) : [];
    const counts = new Map<string, number>(); for (const item of submitted) counts.set(item.assignmentId, (counts.get(item.assignmentId) ?? 0) + 1);
    return page(rows.map((row) => ({ ...teacherAssignment(row), submittedCount: counts.get(row.id) ?? 0 })), total, query);
  }

  async create(teacherId: string, input: AssignmentInput): Promise<RepositoryResult> {
    return prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.findFirst({ where: { id: input.classroomId, teacherId, status: "ACTIVE" }, select: { id: true } });
      if (!classroom) return { status: "NOT_FOUND" };
      if (input.lessonId && !await tx.lesson.findFirst({ where: { id: input.lessonId, session: { classroomId: input.classroomId } }, select: { id: true } })) return { status: "INVALID", message: "Bài học không thuộc lớp đã chọn." };
      const created = await tx.assignment.create({ data: { classroomId: input.classroomId, lessonId: input.lessonId ?? null, createdById: teacherId, title: input.title.trim(), description: input.description?.trim() || null, type: input.type, dueAt: input.dueAt ? new Date(input.dueAt) : null, allowLateSubmission: input.allowLateSubmission, maxAttempts: input.maxAttempts, timeLimitMinutes: input.timeLimitMinutes ?? null, showScoreImmediately: input.showScoreImmediately, showAnswersAfterSubmit: input.showAnswersAfterSubmit ?? false, showLeaderboard: input.showLeaderboard ?? true }, select: assignmentSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_CREATED", entityType: "Assignment", entityId: created.id, metadata: { classroomId: created.classroomId, lessonId: created.lessonId } } });
      return { status: "OK", value: teacherAssignment(created) };
    });
  }

  async teacherDetail(teacherId: string, assignmentId: string): Promise<RepositoryResult> {
    const item = await prisma.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: assignmentSelect });
    return item ? { status: "OK", value: teacherAssignment(item) } : { status: "NOT_FOUND" };
  }

  async update(teacherId: string, assignmentId: string, input: AssignmentPatch): Promise<RepositoryResult> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: { id: true, classroomId: true, lessonId: true, status: true } });
      if (!current) return { status: "NOT_FOUND" }; if (current.status !== AssignmentStatus.DRAFT) return { status: "INVALID_STATE", message: "Chỉ có thể chỉnh sửa bài tập đang ở trạng thái bản nháp." };
      const classroomId = input.classroomId ?? current.classroomId;
      if (input.classroomId && !await tx.classroom.findFirst({ where: { id: input.classroomId, teacherId, status: "ACTIVE" }, select: { id: true } })) return { status: "NOT_FOUND" };
      if (input.classroomId && input.classroomId !== current.classroomId && current.lessonId && input.lessonId === undefined) return { status: "INVALID", message: "Hãy bỏ liên kết bài học hoặc chọn bài học thuộc lớp mới." };
      if (input.lessonId && !await tx.lesson.findFirst({ where: { id: input.lessonId, session: { classroomId } }, select: { id: true } })) return { status: "INVALID", message: "Bài học không thuộc lớp đã chọn." };
      const updated = await tx.assignment.update({ where: { id: assignmentId }, data: assignmentData(input), select: assignmentSelect });
      return { status: "OK", value: teacherAssignment(updated) };
    });
  }

  async transition(teacherId: string, assignmentId: string, action: "publish" | "close" | "archive"): Promise<RepositoryResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: assignmentSelect }); if (!item) return { status: "NOT_FOUND" };
      const expected = action === "publish" ? AssignmentStatus.DRAFT : action === "close" ? AssignmentStatus.PUBLISHED : AssignmentStatus.CLOSED;
      if (item.status !== expected) return { status: "INVALID_STATE", message: "Trạng thái bài tập không phù hợp với thao tác này." };
      const publishError = action === "publish" ? assignmentPublishError({ title: item.title, questionCount: item.questions.length, readAloudTask: item.readAloudTask ? { readingText: item.readAloudTask.readingText, maxScore: Number(item.readAloudTask.maxScore) } : null, writingTask: item.writingTask ? { type: item.writingTask.type, prompt: item.writingTask.prompt, translationItemCount: item.writingTask.translationItems.length } : null }) : null;
      if (publishError) return { status: "INVALID", message: publishError };
      const now = new Date(); const status = action === "publish" ? AssignmentStatus.PUBLISHED : action === "close" ? AssignmentStatus.CLOSED : AssignmentStatus.ARCHIVED;
      const updated = await tx.assignment.update({ where: { id: assignmentId }, data: { status, ...(action === "publish" ? { publishedAt: item.publishedAt ?? now } : {}), ...(action === "close" ? { closedAt: now } : {}) }, select: assignmentSelect });
      const auditAction = action === "publish" && item.generationMode !== AssignmentGenerationMode.MANUAL ? "QUICK_QUIZ_PUBLISHED" : `ASSIGNMENT_${action.toUpperCase()}${action === "publish" ? "ED" : "D"}`;
      await tx.auditLog.create({ data: { actorId: teacherId, action: auditAction, entityType: "Assignment", entityId: assignmentId, metadata: { classroomId: item.classroomId, ...(item.generationMode !== AssignmentGenerationMode.MANUAL ? { generationMode: item.generationMode, sourceLessonIds: item.sourceLessonIds, questionCount: item.questions.length } : {}) } } });
      return { status: "OK", value: teacherAssignment(updated) };
    });
  }

  async delete(teacherId: string, assignmentId: string): Promise<RepositoryResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: { id: true, status: true, classroomId: true, _count: { select: { attempts: true } } } });
      if (!item) return { status: "NOT_FOUND" }; if (item.status !== AssignmentStatus.DRAFT || item._count.attempts > 0) return { status: "INVALID_STATE", message: "Chỉ có thể xóa bản nháp chưa có lượt làm bài." };
      await tx.assignment.delete({ where: { id: assignmentId } }); await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_DELETED", entityType: "Assignment", entityId: assignmentId, metadata: { classroomId: item.classroomId } } });
      return { status: "OK", value: { success: true } };
    });
  }

  private async draft(tx: Prisma.TransactionClient, teacherId: string, assignmentId: string) { return tx.assignment.findFirst({ where: { id: assignmentId, status: AssignmentStatus.DRAFT, classroom: { teacherId } }, select: { id: true } }); }
  async addQuestion(teacherId: string, assignmentId: string, input: QuestionInput): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; if (input.passageId && !await tx.assignmentPassage.findFirst({ where: { id: input.passageId, assignmentId }, select: { id: true } })) return { status: "INVALID", message: "Đoạn đọc không thuộc bài tập." }; const aggregate = await tx.assignmentQuestion.aggregate({ where: { assignmentId }, _max: { position: true } }); const item = await tx.assignmentQuestion.create({ data: { assignmentId, passageId: input.passageId ?? null, type: input.type, section: input.section, prompt: input.prompt, explanation: input.explanation ?? null, points: input.points, required: input.required, config: input.config as Prisma.InputJsonValue, position: (aggregate._max.position ?? -1) + 1 }, select: questionSelect }); return { status: "OK", value: teacherQuestion(item) }; }); }
  async updateQuestion(teacherId: string, assignmentId: string, questionId: string, input: QuestionInput): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; const existing = await tx.assignmentQuestion.findFirst({ where: { id: questionId, assignmentId }, select: { id: true } }); if (!existing) return { status: "NOT_FOUND" }; if (input.passageId && !await tx.assignmentPassage.findFirst({ where: { id: input.passageId, assignmentId }, select: { id: true } })) return { status: "INVALID", message: "Đoạn đọc không thuộc bài tập." }; const item = await tx.assignmentQuestion.update({ where: { id: questionId }, data: { passageId: input.passageId ?? null, type: input.type, section: input.section, prompt: input.prompt, explanation: input.explanation ?? null, points: input.points, required: input.required, config: input.config as Prisma.InputJsonValue }, select: questionSelect }); return { status: "OK", value: teacherQuestion(item) }; }); }
  async deleteQuestion(teacherId: string, assignmentId: string, questionId: string): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; const deleted = await tx.assignmentQuestion.deleteMany({ where: { id: questionId, assignmentId } }); return deleted.count ? { status: "OK", value: { success: true } } : { status: "NOT_FOUND" }; }); }
  async reorderQuestions(teacherId: string, assignmentId: string, input: ReorderInput): Promise<RepositoryResult> { return this.reorder(teacherId, assignmentId, input, "question"); }
  async addPassage(teacherId: string, assignmentId: string, input: PassageInput): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; const aggregate = await tx.assignmentPassage.aggregate({ where: { assignmentId }, _max: { position: true } }); const item = await tx.assignmentPassage.create({ data: { assignmentId, title: input.title?.trim() || null, content: input.content.trim(), position: (aggregate._max.position ?? -1) + 1 }, select: passageSelect }); return { status: "OK", value: item }; }); }
  async updatePassage(teacherId: string, assignmentId: string, passageId: string, input: PassageInput): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; const updated = await tx.assignmentPassage.updateMany({ where: { id: passageId, assignmentId }, data: { title: input.title?.trim() || null, content: input.content.trim() } }); if (!updated.count) return { status: "NOT_FOUND" }; return { status: "OK", value: await tx.assignmentPassage.findUnique({ where: { id: passageId }, select: passageSelect }) }; }); }
  async deletePassage(teacherId: string, assignmentId: string, passageId: string): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; const passage = await tx.assignmentPassage.findFirst({ where: { id: passageId, assignmentId }, select: { id: true, _count: { select: { questions: true } } } }); if (!passage) return { status: "NOT_FOUND" }; if (passage._count.questions) return { status: "INVALID_STATE", message: `Bài đọc đang có ${passage._count.questions} câu hỏi. Hãy chuyển, tách hoặc xóa các câu hỏi đó trước.` }; await tx.assignmentPassage.delete({ where: { id: passageId } }); return { status: "OK", value: { success: true } }; }); }
  async reorderPassages(teacherId: string, assignmentId: string, input: ReorderInput): Promise<RepositoryResult> { return this.reorder(teacherId, assignmentId, input, "passage"); }
  private async reorder(teacherId: string, assignmentId: string, input: ReorderInput, kind: "question" | "passage"): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { if (!await this.draft(tx, teacherId, assignmentId)) return { status: "NOT_FOUND" }; const model = kind === "question" ? tx.assignmentQuestion : tx.assignmentPassage; const current = await (model as typeof tx.assignmentQuestion).findMany({ where: { assignmentId }, select: { id: true } }); if (current.length !== input.ids.length || input.ids.some((id) => !current.some((item) => item.id === id))) return { status: "INVALID", message: "Danh sách sắp xếp không đầy đủ." }; for (const [index, id] of input.ids.entries()) await (model as typeof tx.assignmentQuestion).update({ where: { id }, data: { position: -1000 - index } }); for (const [index, id] of input.ids.entries()) await (model as typeof tx.assignmentQuestion).update({ where: { id }, data: { position: index } }); return { status: "OK", value: { success: true } }; }); }

  async listStudent(studentId: string, query: AssignmentListQuery) {
    const where: Prisma.AssignmentWhereInput = { status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED, AssignmentStatus.ARCHIVED] }, classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } }, ...(query.classroomId ? { classroomId: query.classroomId } : {}), ...(query.lessonId ? { lessonId: query.lessonId } : {}), ...(query.type ? { type: query.type } : {}), ...(query.status && query.status !== AssignmentStatus.DRAFT ? { status: query.status } : {}) };
    const [rows, total] = await prisma.$transaction([prisma.assignment.findMany({ where, select: assignmentSelect, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.assignment.count({ where })]);
    const attempts = rows.length ? await prisma.assignmentAttempt.findMany({ where: { studentId, assignmentId: { in: rows.map((row) => row.id) } }, include: { answers: { select: { isCorrect: true } } }, orderBy: { attemptNumber: "desc" } }) : [];
    return page(rows.map((row) => { const own = attempts.filter((attempt) => attempt.assignmentId === row.id); const latest = own[0]; return { ...studentAssignment(row), questions: undefined, passages: undefined, questionCount: row.questions.length, attemptCount: own.length, attemptsRemaining: Math.max(0, row.maxAttempts - own.length), latestAttempt: latest ? this.studentAttemptSummary(latest, row.showScoreImmediately, row.questions.length) : null }; }), total, query);
  }
  async studentDetail(studentId: string, assignmentId: string): Promise<RepositoryResult> { const item = await prisma.assignment.findFirst({ where: { id: assignmentId, status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED, AssignmentStatus.ARCHIVED] }, classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } } }, select: assignmentSelect }); if (!item) return { status: "NOT_FOUND" }; const attempts = await prisma.assignmentAttempt.findMany({ where: { assignmentId, studentId }, include: { answers: { select: { isCorrect: true } } }, orderBy: { attemptNumber: "desc" } }); return { status: "OK", value: { ...studentAssignment(item), questions: undefined, questionCount: item.questions.length, attemptCount: attempts.length, attempts: attempts.map((attempt) => this.studentAttemptSummary(attempt, item.showScoreImmediately, item.questions.length)), attemptsRemaining: Math.max(0, item.maxAttempts - attempts.length) } }; }
  async startAttempt(studentId: string, assignmentId: string): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { const item = await tx.assignment.findFirst({ where: { id: assignmentId, status: AssignmentStatus.PUBLISHED, classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } } }, select: assignmentSelect }); if (!item) return { status: "NOT_FOUND" }; const active = await tx.assignmentAttempt.findFirst({ where: { assignmentId, studentId, status: AssignmentAttemptStatus.IN_PROGRESS }, orderBy: { attemptNumber: "desc" } }); if (active) return { status: "OK", value: await this.attemptView(tx, active.id, studentId) }; const count = await tx.assignmentAttempt.count({ where: { assignmentId, studentId } }); if (count >= item.maxAttempts) return { status: "LIMIT", message: "Bạn đã sử dụng hết số lần làm bài." }; const now = new Date(); if (item.dueAt && now > item.dueAt && !item.allowLateSubmission) return { status: "DUE", message: "Bài tập đã quá hạn nộp." }; const maxScore = item.questions.reduce((sum, question) => sum + Number(question.points), 0); const created = await tx.assignmentAttempt.create({ data: { assignmentId, studentId, attemptNumber: count + 1, maxScore }, select: { id: true } }); return { status: "OK", value: await this.attemptView(tx, created.id, studentId) }; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async studentAttempt(studentId: string, attemptId: string, resultOnly = false): Promise<RepositoryResult> { const value = await this.attemptView(prisma, attemptId, studentId, resultOnly); return value ? { status: "OK", value } : { status: "NOT_FOUND" }; }
  async saveAnswer(studentId: string, attemptId: string, questionId: string, input: AnswerInput): Promise<RepositoryResult> { return prisma.$transaction(async (tx) => { const attempt = await tx.assignmentAttempt.findFirst({ where: { id: attemptId, studentId, status: AssignmentAttemptStatus.IN_PROGRESS }, select: { id: true, assignmentId: true, startedAt: true, assignment: { select: { timeLimitMinutes: true } } } }); if (!attempt) return { status: "NOT_FOUND" }; if (attemptExpired(attempt.startedAt, attempt.assignment.timeLimitMinutes)) return { status: "DUE", message: "Đã hết thời gian làm Quick Quiz." }; if (!await tx.assignmentQuestion.findFirst({ where: { id: questionId, assignmentId: attempt.assignmentId }, select: { id: true } })) return { status: "NOT_FOUND" }; const answer = await tx.assignmentAnswer.upsert({ where: { attemptId_questionId: { attemptId, questionId } }, create: { attemptId, questionId, answer: input.answer as Prisma.InputJsonValue }, update: { answer: input.answer as Prisma.InputJsonValue, normalized: Prisma.JsonNull, isCorrect: null, awardedPoints: null }, select: { id: true, questionId: true, answer: true, updatedAt: true } }); return { status: "OK", value: answer }; }); }
  async submit(studentId: string, attemptId: string): Promise<RepositoryResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const attempt = await tx.assignmentAttempt.findFirst({ where: { id: attemptId, studentId }, include: { assignment: { include: { questions: { orderBy: { position: "asc" } }, readAloudTask: true, writingTask: { include: { translationItems: { orderBy: { position: "asc" } } } } } }, answers: true, readAloudSubmission: true, writingSubmission: { include: { translationAnswers: true } } } });
        if (!attempt) return { status: "NOT_FOUND" };
        if (attempt.status !== AssignmentAttemptStatus.IN_PROGRESS) return { status: "OK", value: await this.attemptView(tx, attemptId, studentId, true) };
        if (missingRequiredReadAloud(attempt.assignment.readAloudTask, attempt.readAloudSubmission)) return { status: "INVALID", message: "Bạn cần hoàn thành bài đọc ghi âm trước khi nộp bài." };
        if (attempt.assignment.writingTask) {
          if (!attempt.writingSubmission) return { status: "INVALID", message: "Bạn cần hoàn thành phần Writing trước khi nộp bài." };
          if (attempt.assignment.writingTask.type === "ESSAY") {
            const wordCount = attempt.writingSubmission.wordCount ?? 0;
            if (!attempt.writingSubmission.essayContent?.trim()) return { status: "INVALID", message: "Bạn cần nhập nội dung Essay trước khi nộp bài." };
            if (attempt.assignment.writingTask.minWords != null && wordCount < attempt.assignment.writingTask.minWords) return { status: "INVALID", message: `Essay cần ít nhất ${attempt.assignment.writingTask.minWords} từ.` };
          } else {
            const answersByItem = new Map(attempt.writingSubmission.translationAnswers.map((answer) => [answer.translationItemId, answer.answerText]));
            if (attempt.assignment.writingTask.translationItems.some((item) => !answersByItem.get(item.id)?.trim())) return { status: "INVALID", message: "Bạn cần hoàn thành tất cả câu dịch trước khi nộp bài." };
          }
        }
        const submittedAt = new Date();
        const late = Boolean(attempt.assignment.dueAt && submittedAt > attempt.assignment.dueAt);
        if (late && !attempt.assignment.allowLateSubmission) return { status: "DUE", message: "Bài tập đã quá hạn và không cho phép nộp muộn." };
        const answers = new Map(attempt.answers.map((answer) => [answer.questionId, answer.answer]));
        let score = 0;
        const automaticMaxScore = attempt.assignment.questions.reduce((sum, question) => sum + Number(question.points), 0);
        let correctCount = 0;
        for (const question of attempt.assignment.questions) {
          const result = gradeQuestion({ type: question.type, points: Number(question.points), config: question.config }, answers.get(question.id));
          score += result.awardedPoints;
          if (result.isCorrect) correctCount += 1;
          await tx.assignmentAnswer.upsert({ where: { attemptId_questionId: { attemptId, questionId: question.id } }, create: { attemptId, questionId: question.id, answer: (answers.get(question.id) ?? {}) as Prisma.InputJsonValue, normalized: result.normalized as Prisma.InputJsonValue, isCorrect: result.isCorrect, awardedPoints: result.awardedPoints }, update: { normalized: result.normalized as Prisma.InputJsonValue, isCorrect: result.isCorrect, awardedPoints: result.awardedPoints } });
        }
        if (attempt.readAloudSubmission) await tx.assignmentReadAloudSubmission.update({ where: { id: attempt.readAloudSubmission.id }, data: { submittedAt } });
        if (attempt.writingSubmission) await tx.writingSubmission.update({ where: { id: attempt.writingSubmission.id }, data: { submittedAt } });
        const objectivePercentage = attempt.assignment.questions.length ? correctCount / attempt.assignment.questions.length * 100 : 0;
        await tx.assignmentAttempt.update({ where: { id: attemptId }, data: { status: attempt.assignment.readAloudTask || attempt.assignment.writingTask ? AssignmentAttemptStatus.PENDING_MANUAL_GRADE : AssignmentAttemptStatus.AUTO_GRADED, score, maxScore: automaticMaxScore, percentage: objectivePercentage, submittedAt, isLate: late } });
        return { status: "OK", value: await this.attemptView(tx, attemptId, studentId, true) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return this.studentAttempt(studentId, attemptId, true);
      throw error;
    }
  }

  private studentAttemptSummary(attempt: { id: string; attemptNumber: number; status: AssignmentAttemptStatus; startedAt: Date; submittedAt: Date | null; isLate: boolean; answers: { isCorrect: boolean | null }[] }, showScoreImmediately: boolean, totalQuestions: number) {
    const submitted = attempt.status !== AssignmentAttemptStatus.IN_PROGRESS;
    return { id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, durationMs: attempt.submittedAt ? attemptDurationMs(attempt.startedAt, attempt.submittedAt) : null, isLate: attempt.isLate, ...(showScoreImmediately && submitted && totalQuestions > 0 ? { objectiveResult: objectiveResult(attempt.answers, totalQuestions) } : {}) };
  }
  private async attemptView(client: Prisma.TransactionClient | typeof prisma, attemptId: string, studentId: string, resultOnly = false) {
    const attempt = await client.assignmentAttempt.findFirst({ where: { id: attemptId, studentId }, include: { assignment: { select: assignmentSelect }, answers: { orderBy: { question: { position: "asc" } } }, readAloudSubmission: { select: submissionAttemptSelect }, writingSubmission: { select: writingSubmissionSelect } } });
    if (!attempt) return null;
    const submitted = attempt.status !== AssignmentAttemptStatus.IN_PROGRESS;
    const pendingManual = attempt.status === AssignmentAttemptStatus.PENDING_MANUAL_GRADE;
    const showGrade = attempt.assignment.showScoreImmediately && submitted;
    const reveal = submitted && attempt.assignment.showAnswersAfterSubmit;
    const questions = new Map(attempt.assignment.questions.map((question) => [question.id, question]));
    return { id: attempt.id, assignmentId: attempt.assignmentId, attemptNumber: attempt.attemptNumber, status: attempt.status, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, durationMs: attempt.submittedAt ? Math.max(0, attempt.submittedAt.getTime() - attempt.startedAt.getTime()) : null, expiresAt: attempt.assignment.timeLimitMinutes ? new Date(attempt.startedAt.getTime() + attempt.assignment.timeLimitMinutes * 60_000) : null, isLate: attempt.isLate, pendingManualGrade: pendingManual, assignment: studentAssignment(attempt.assignment, reveal), answers: attempt.answers.map((answer) => { const question = questions.get(answer.questionId); return { questionId: answer.questionId, answer: answer.answer, updatedAt: answer.updatedAt, ...(showGrade && question ? { result: humanReadableQuestionResult(question, answer, reveal) } : {}) }; }), readAloudSubmission: attempt.readAloudSubmission ? { id: attempt.readAloudSubmission.id, durationSeconds: attempt.readAloudSubmission.durationSeconds, submittedAt: attempt.readAloudSubmission.submittedAt, audioAttachment: attempt.readAloudSubmission.audioAttachment, audioUrl: `/assignment-read-aloud-submissions/${attempt.readAloudSubmission.id}/audio`, ...(showGrade ? { score: decimal(attempt.readAloudSubmission.score), feedback: attempt.readAloudSubmission.feedback, gradedAt: attempt.readAloudSubmission.gradedAt } : {}) } : null, writingSubmission: writingSubmissionView(attempt.assignment.writingTask, attempt.writingSubmission, showGrade), ...(showGrade && attempt.assignment.questions.length > 0 ? { objectiveResult: objectiveResult(attempt.answers, attempt.assignment.questions.length) } : {}), resultOnly };
  }

  async results(teacherId: string, assignmentId: string): Promise<RepositoryResult> {
    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, classroom: { teacherId } },
      select: {
        id: true,
        _count: { select: { questions: true } },
        writingTask: { select: writingTaskSelect },
        classroom: {
          select: {
            enrollments: {
              where: { status: EnrollmentStatus.ACTIVE },
              select: { student: { select: { user: { select: { id: true, fullName: true, email: true } } } } },
            },
          },
        },
      },
    });
    if (!assignment) return { status: "NOT_FOUND" };
    const attempts = await prisma.assignmentAttempt.findMany({ where: { assignmentId, status: { in: submittedStatuses } }, include: { answers: { select: { isCorrect: true } }, readAloudSubmission: { select: { score: true, gradedAt: true } }, writingSubmission: { select: writingSubmissionSelect } }, orderBy: [{ studentId: "asc" }, { attemptNumber: "desc" }] });
    const latest = new Map<string, typeof attempts[number]>();
    for (const attempt of attempts) if (!latest.has(attempt.studentId)) latest.set(attempt.studentId, attempt);
    const enrolled = assignment.classroom.enrollments.map((item) => item.student.user); const submitted = [...latest.values()]; const percentages = assignment._count.questions > 0 ? submitted.map((item) => objectiveResult(item.answers, assignment._count.questions).percentage) : [];
    return { status: "OK", value: { summary: { enrolled: enrolled.length, submitted: latest.size, notSubmitted: enrolled.length - latest.size, averagePercentage: percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null, highestPercentage: percentages.length ? Math.max(...percentages) : null, lowestPercentage: percentages.length ? Math.min(...percentages) : null, lateSubmissions: submitted.filter((item) => item.isLate).length }, students: enrolled.map((student) => { const attempt = latest.get(student.id); const writing = attempt && assignment.writingTask ? writingSubmissionView(assignment.writingTask, attempt.writingSubmission) : null; return { student, status: attempt ? "SUBMITTED" : "NOT_SUBMITTED", ...(attempt ? { ...this.studentAttemptSummary(attempt, true, assignment._count.questions), audioResult: attempt.readAloudSubmission ? { status: attempt.readAloudSubmission.gradedAt ? "GRADED" : "PENDING_GRADE", score: decimal(attempt.readAloudSubmission.score), maxScore: READ_ALOUD_MAX_SCORE } : null, writingResult: assignment.writingTask ? { type: assignment.writingTask.type, status: !writing ? "PENDING_GRADE" : assignment.writingTask.type === "ESSAY" ? writing.essayScore === null ? "PENDING_GRADE" : "GRADED" : writing.translationResult?.complete ? "GRADED" : "PENDING_GRADE", essayScore: writing?.essayScore ?? null, maxScore: 10, translationResult: writing?.translationResult ?? null } : null } : {}) }; }) } };
  }
  async studentResults(teacherId: string, assignmentId: string, studentId: string): Promise<RepositoryResult> {
    const allowed = await prisma.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: { id: true } }); if (!allowed) return { status: "NOT_FOUND" };
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { questions: { select: { id: true } } } });
    const attempts = await prisma.assignmentAttempt.findMany({ where: { assignmentId, studentId }, include: { answers: { select: { isCorrect: true } } }, orderBy: { attemptNumber: "desc" } });
    return { status: "OK", value: attempts.map((attempt) => this.studentAttemptSummary(attempt, true, assignment?.questions.length ?? 0)) };
  }
  async teacherAttempt(teacherId: string, assignmentId: string, attemptId: string): Promise<RepositoryResult> {
    const attempt = await prisma.assignmentAttempt.findFirst({ where: { id: attemptId, assignmentId, assignment: { classroom: { teacherId } } }, include: { student: { select: { user: { select: { id: true, fullName: true, email: true } } } }, assignment: { select: assignmentSelect }, answers: true, readAloudSubmission: { select: submissionAttemptSelect }, writingSubmission: { select: writingSubmissionSelect } } }); if (!attempt) return { status: "NOT_FOUND" };
    const answers = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
    return { status: "OK", value: { id: attempt.id, student: attempt.student.user, attemptNumber: attempt.attemptNumber, status: attempt.status, submittedAt: attempt.submittedAt, durationMs: attempt.submittedAt ? Math.max(0, attempt.submittedAt.getTime() - attempt.startedAt.getTime()) : null, isLate: attempt.isLate, objectiveResult: attempt.assignment.questions.length > 0 ? objectiveResult(attempt.answers, attempt.assignment.questions.length) : null, passages: attempt.assignment.passages, questions: attempt.assignment.questions.map((question) => { const answer = answers.get(question.id); return { id: question.id, passageId: question.passageId, type: question.type, section: question.section, position: question.position, prompt: question.prompt, explanation: question.explanation, ...humanReadableQuestionResult(question, answer, true) }; }), readAloudTask: attempt.assignment.readAloudTask ? { ...attempt.assignment.readAloudTask, maxScore: READ_ALOUD_MAX_SCORE } : null, readAloudSubmission: attempt.readAloudSubmission ? { ...attempt.readAloudSubmission, score: decimal(attempt.readAloudSubmission.score), audioUrl: `/assignment-read-aloud-submissions/${attempt.readAloudSubmission.id}/audio` } : null, writingTask: attempt.assignment.writingTask ? { ...attempt.assignment.writingTask, maxScore: 10 } : null, writingSubmission: writingSubmissionView(attempt.assignment.writingTask, attempt.writingSubmission) } };
  }
}
