import { Injectable } from "@nestjs/common";
import { AssignmentAttemptStatus, AssignmentGenerationMode, AssignmentStatus, AssignmentType, EnrollmentStatus, LessonStatus, Prisma, Role, UserStatus } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { rankLeaderboard } from "./leaderboard";
import { QuickQuizRepository } from "./quick-quiz.repository";
import type { PersistedQuestionInput, QuickQuizRepositoryResult, QuickQuizSaveInput, QuickQuizSource, SourceLesson } from "./quiz-generation.types";

const submitted = [AssignmentAttemptStatus.SUBMITTED, AssignmentAttemptStatus.AUTO_GRADED, AssignmentAttemptStatus.PENDING_MANUAL_GRADE, AssignmentAttemptStatus.FULLY_GRADED];
const questionData = (assignmentId: string, question: PersistedQuestionInput, position: number) => ({ assignmentId, type: question.type, section: question.section, position, prompt: question.prompt, explanation: question.explanation, points: question.points, required: question.required, config: question.config as Prisma.InputJsonValue });

@Injectable()
export class PrismaQuickQuizRepository extends QuickQuizRepository {
  async sourceLessons(teacherId: string, classroomId: string, source: QuickQuizSource): Promise<QuickQuizRepositoryResult<SourceLesson[]>> {
    const classroom = await prisma.classroom.findFirst({ where: { id: classroomId, teacherId }, select: { id: true } });
    if (!classroom) return { status: "NOT_FOUND" };
    if (source.mode === "SELECTED") {
      const lessons = await prisma.lesson.findMany({ where: { id: { in: source.lessonIds }, session: { classroomId, classroom: { teacherId } }, vocabulary: { not: null } }, select: { id: true, title: true, vocabulary: true, session: { select: { scheduledStart: true } } }, orderBy: { session: { scheduledStart: "desc" } } });
      if (lessons.length !== new Set(source.lessonIds).size) return { status: "INVALID", message: "Một hoặc nhiều buổi học đã chọn không hợp lệ hoặc chưa có từ vựng." };
      return { status: "OK", value: lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, vocabulary: lesson.vocabulary!, scheduledStart: lesson.session.scheduledStart })) };
    }
    const lessons = await prisma.lesson.findMany({ where: { status: { in: [LessonStatus.PUBLISHED, LessonStatus.ARCHIVED] }, vocabulary: { not: null }, session: { classroomId, scheduledStart: { lte: new Date() }, classroom: { teacherId } } }, select: { id: true, title: true, vocabulary: true, session: { select: { scheduledStart: true } } }, orderBy: { session: { scheduledStart: "desc" } }, take: source.recentLessons });
    return { status: "OK", value: lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, vocabulary: lesson.vocabulary!, scheduledStart: lesson.session.scheduledStart })) };
  }

  private async saveQuestions(tx: Prisma.TransactionClient, assignmentId: string, input: QuickQuizSaveInput) {
    await tx.assignmentQuestion.createMany({ data: input.questions.map((question, position) => questionData(assignmentId, question, position)) });
  }

  async create(teacherId: string, input: QuickQuizSaveInput): Promise<QuickQuizRepositoryResult<{ assignmentId: string }>> {
    return prisma.$transaction(async (tx) => {
      if (!await tx.classroom.findFirst({ where: { id: input.classroomId, teacherId, status: "ACTIVE" }, select: { id: true } })) return { status: "NOT_FOUND" };
      const assignment = await tx.assignment.create({ data: { classroomId: input.classroomId, createdById: teacherId, title: input.title, description: "Ôn tập nhanh từ vựng từ các buổi học gần đây.", type: AssignmentType.QUIZ, status: AssignmentStatus.DRAFT, allowLateSubmission: false, maxAttempts: input.maxAttempts, timeLimitMinutes: input.timeLimitMinutes, shuffleQuestions: false, shuffleOptions: false, showScoreImmediately: true, showAnswersAfterSubmit: false, showLeaderboard: input.showLeaderboard, generationMode: input.generationMode as AssignmentGenerationMode, generationModel: input.generationModel, sourceLessonIds: input.sourceLessonIds } });
      await this.saveQuestions(tx, assignment.id, input);
      await tx.auditLog.create({ data: { actorId: teacherId, action: "QUICK_QUIZ_GENERATED", entityType: "Assignment", entityId: assignment.id, metadata: { assignmentId: assignment.id, classroomId: input.classroomId, sourceLessonIds: input.sourceLessonIds, sourceWordCount: input.sourceWordCount, questionCount: input.questions.length, generationMode: input.generationMode } } });
      return { status: "OK", value: { assignmentId: assignment.id } };
    });
  }

  async regenerate(teacherId: string, assignmentId: string, input: QuickQuizSaveInput): Promise<QuickQuizRepositoryResult<{ assignmentId: string }>> {
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: { id: true, classroomId: true, status: true, generationMode: true, _count: { select: { attempts: true } } } });
      if (!assignment) return { status: "NOT_FOUND" };
      if (assignment.status !== AssignmentStatus.DRAFT || assignment._count.attempts > 0 || assignment.generationMode === AssignmentGenerationMode.MANUAL) return { status: "INVALID_STATE", message: "Chỉ có thể tạo lại Quick Quiz đang là bản nháp và chưa có lượt làm." };
      if (assignment.classroomId !== input.classroomId) return { status: "INVALID", message: "Không thể đổi lớp khi tạo lại Quick Quiz." };
      await tx.assignmentQuestion.deleteMany({ where: { assignmentId } });
      await tx.assignment.update({ where: { id: assignmentId }, data: { maxAttempts: input.maxAttempts, timeLimitMinutes: input.timeLimitMinutes, showLeaderboard: input.showLeaderboard, generationMode: input.generationMode as AssignmentGenerationMode, generationModel: input.generationModel, sourceLessonIds: input.sourceLessonIds } });
      await this.saveQuestions(tx, assignmentId, input);
      await tx.auditLog.create({ data: { actorId: teacherId, action: "QUICK_QUIZ_REGENERATED", entityType: "Assignment", entityId: assignmentId, metadata: { assignmentId, classroomId: input.classroomId, sourceLessonIds: input.sourceLessonIds, sourceWordCount: input.sourceWordCount, questionCount: input.questions.length, generationMode: input.generationMode } } });
      return { status: "OK", value: { assignmentId } };
    });
  }

  async leaderboard(userId: string, roles: Role[], assignmentId: string): Promise<QuickQuizRepositoryResult> {
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, status: true, type: true, showLeaderboard: true, classroom: { select: { teacherId: true, enrollments: { where: { studentId: userId, status: EnrollmentStatus.ACTIVE }, select: { studentId: true }, take: 1 } } }, _count: { select: { questions: true } } } });
    if (!assignment || assignment.type !== AssignmentType.QUIZ) return { status: "NOT_FOUND" };
    const teacher = roles.includes(Role.TEACHER) && assignment.classroom.teacherId === userId && Boolean(await prisma.teacherProfile.findFirst({ where: { userId, approvalStatus: "APPROVED", user: { status: UserStatus.ACTIVE } }, select: { userId: true } }));
    const student = roles.includes(Role.STUDENT) && assignment.showLeaderboard && assignment.status !== AssignmentStatus.DRAFT && assignment.classroom.enrollments.length > 0;
    if (!teacher && !student) return { status: "NOT_FOUND" };
    const attempts = await prisma.assignmentAttempt.findMany({ where: { assignmentId, status: { in: submitted }, submittedAt: { not: null } }, select: { id: true, attemptNumber: true, startedAt: true, submittedAt: true, answers: { select: { isCorrect: true } }, student: { select: { user: { select: { id: true, fullName: true } } } } } });
    const entries = rankLeaderboard(attempts.map((attempt) => ({ ...attempt, submittedAt: attempt.submittedAt!, student: attempt.student.user })), assignment._count.questions);
    return { status: "OK", value: { assignmentId, entries } };
  }
}
