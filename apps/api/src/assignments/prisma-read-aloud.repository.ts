import { Injectable } from "@nestjs/common";
import { AssignmentAttemptStatus, AssignmentStatus, EnrollmentStatus, Prisma, Role, UserStatus } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { ReadAloudRepository, type ReadAloudAudioInput, type ReadAloudAudioRecord, type ReadAloudResult, type ReadAloudTaskInput } from "./read-aloud.repository";
import { calculateAssignmentOutcome } from "./manual-grading";

const number = (value: Prisma.Decimal | number | null) => value === null ? null : typeof value === "number" ? value : value.toNumber();
const taskSelect = { id: true, assignmentId: true, title: true, readingText: true, instructions: true, maxScore: true, maxDurationSeconds: true, createdAt: true, updatedAt: true } satisfies Prisma.AssignmentReadAloudTaskSelect;
const taskView = (task: Prisma.AssignmentReadAloudTaskGetPayload<{ select: typeof taskSelect }>) => ({ ...task, maxScore: number(task.maxScore) });
const submissionSelect = {
  id: true, assignmentId: true, readAloudTaskId: true, attemptId: true, studentId: true, durationSeconds: true,
  submittedAt: true, score: true, feedback: true, gradedAt: true, createdAt: true, updatedAt: true,
  audioAttachment: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
} satisfies Prisma.AssignmentReadAloudSubmissionSelect;
const submissionView = (item: Prisma.AssignmentReadAloudSubmissionGetPayload<{ select: typeof submissionSelect }>) => ({ ...item, score: number(item.score), audioUrl: `/assignment-read-aloud-submissions/${item.id}/audio` });

@Injectable()
export class PrismaReadAloudRepository extends ReadAloudRepository {
  async upsertTask(teacherId: string, assignmentId: string, input: ReadAloudTaskInput): Promise<ReadAloudResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, status: AssignmentStatus.DRAFT, classroom: { teacherId } }, select: { id: true, classroomId: true, readAloudTask: { select: { id: true } } } });
      if (!assignment) return { status: "NOT_FOUND" };
      const task = await tx.assignmentReadAloudTask.upsert({ where: { assignmentId }, create: { assignmentId, title: input.title?.trim() || null, readingText: input.readingText.trim(), instructions: input.instructions?.trim() || null, maxScore: input.maxScore, maxDurationSeconds: input.maxDurationSeconds ?? 300 }, update: { title: input.title?.trim() || null, readingText: input.readingText.trim(), instructions: input.instructions?.trim() || null, maxScore: input.maxScore, maxDurationSeconds: input.maxDurationSeconds ?? 300 }, select: taskSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: assignment.readAloudTask ? "ASSIGNMENT_READ_ALOUD_UPDATED" : "ASSIGNMENT_READ_ALOUD_ENABLED", entityType: "AssignmentReadAloudTask", entityId: task.id, metadata: { assignmentId, classroomId: assignment.classroomId } } });
      return { status: "OK", value: taskView(task) };
    });
  }

  async deleteTask(teacherId: string, assignmentId: string): Promise<ReadAloudResult> {
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, status: AssignmentStatus.DRAFT, classroom: { teacherId } }, select: { classroomId: true, readAloudTask: { select: { id: true } } } });
      if (!assignment?.readAloudTask) return { status: "NOT_FOUND" };
      await tx.assignmentReadAloudTask.delete({ where: { id: assignment.readAloudTask.id } });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_READ_ALOUD_DISABLED", entityType: "AssignmentReadAloudTask", entityId: assignment.readAloudTask.id, metadata: { assignmentId, classroomId: assignment.classroomId } } });
      return { status: "OK", value: { success: true } };
    });
  }

  async studentTask(studentId: string, assignmentId: string): Promise<ReadAloudResult> {
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED, AssignmentStatus.ARCHIVED] }, classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } } }, select: { readAloudTask: { select: taskSelect } } });
    return assignment?.readAloudTask ? { status: "OK", value: taskView(assignment.readAloudTask) } : { status: "NOT_FOUND" };
  }

  async saveUpload(studentId: string, attemptId: string, input: ReadAloudAudioInput): Promise<ReadAloudResult<{ submission: unknown; oldStorageKey: string | null }>> {
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.assignmentAttempt.findFirst({ where: { id: attemptId, studentId, status: AssignmentAttemptStatus.IN_PROGRESS }, select: { id: true, assignmentId: true, assignment: { select: { readAloudTask: { select: taskSelect } } }, readAloudSubmission: { select: { audioAttachment: { select: { id: true, storageKey: true } } } } } });
      const task = attempt?.assignment.readAloudTask;
      if (!attempt || !task) return { status: "NOT_FOUND" };
      if (input.durationSeconds && task.maxDurationSeconds && input.durationSeconds > task.maxDurationSeconds) return { status: "INVALID", message: `Bản ghi vượt quá thời lượng tối đa ${task.maxDurationSeconds} giây.` };
      const attachment = await tx.assignmentAudioAttachment.create({ data: { fileName: input.fileName, fileType: input.fileType, fileSize: input.fileSize, storageKey: input.storageKey, uploadedById: studentId }, select: { id: true } });
      const submission = await tx.assignmentReadAloudSubmission.upsert({ where: { attemptId }, create: { assignmentId: attempt.assignmentId, readAloudTaskId: task.id, attemptId, studentId, audioAttachmentId: attachment.id, durationSeconds: input.durationSeconds ?? null }, update: { audioAttachmentId: attachment.id, durationSeconds: input.durationSeconds ?? null, score: null, feedback: null, gradedById: null, gradedAt: null }, select: submissionSelect });
      const old = attempt.readAloudSubmission?.audioAttachment ?? null;
      if (old) await tx.assignmentAudioAttachment.delete({ where: { id: old.id } });
      return { status: "OK", value: { submission: submissionView(submission), oldStorageKey: old?.storageKey ?? null } };
    });
  }

  async audio(userId: string, roles: Role[], submissionId: string): Promise<ReadAloudAudioRecord | null> {
    const item = await prisma.assignmentReadAloudSubmission.findUnique({ where: { id: submissionId }, select: { studentId: true, audioAttachment: { select: { storageKey: true, fileName: true, fileType: true } }, assignment: { select: { classroom: { select: { teacherId: true } } } } } });
    if (!item) return null;
    if (roles.includes(Role.ADMIN) || (roles.includes(Role.STUDENT) && item.studentId === userId)) return item.audioAttachment;
    if (roles.includes(Role.TEACHER) && item.assignment.classroom.teacherId === userId) {
      const approved = await prisma.teacherProfile.findFirst({ where: { userId, approvalStatus: "APPROVED", user: { status: UserStatus.ACTIVE } }, select: { userId: true } });
      if (approved) return item.audioAttachment;
    }
    return null;
  }

  async audioForAttempt(studentId: string, attemptId: string): Promise<ReadAloudAudioRecord | null> {
    const item = await prisma.assignmentReadAloudSubmission.findFirst({ where: { attemptId, studentId }, select: { audioAttachment: { select: { storageKey: true, fileName: true, fileType: true } } } });
    return item?.audioAttachment ?? null;
  }

  async results(teacherId: string, assignmentId: string): Promise<ReadAloudResult> {
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, classroom: { teacherId } }, select: { readAloudTask: { select: taskSelect }, classroom: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE }, select: { student: { select: { user: { select: { id: true, fullName: true, email: true } } } } } } } } } });
    if (!assignment?.readAloudTask) return { status: "NOT_FOUND" };
    const submissions = await prisma.assignmentReadAloudSubmission.findMany({ where: { assignmentId, submittedAt: { not: null } }, select: { ...submissionSelect, attempt: { select: { attemptNumber: true } } }, orderBy: [{ studentId: "asc" }, { attempt: { attemptNumber: "desc" } }] });
    const latest = new Map<string, typeof submissions[number]>();
    for (const item of submissions) if (!latest.has(item.studentId)) latest.set(item.studentId, item);
    return { status: "OK", value: { task: taskView(assignment.readAloudTask), students: assignment.classroom.enrollments.map(({ student }) => { const submission = latest.get(student.user.id); return { student: student.user, status: !submission ? "NOT_SUBMITTED" : submission.gradedAt ? "GRADED" : "PENDING_GRADE", submission: submission ? { ...submissionView(submission), attemptNumber: submission.attempt.attemptNumber } : null }; }) } };
  }

  async grade(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null): Promise<ReadAloudResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.assignmentReadAloudSubmission.findFirst({ where: { id: submissionId, assignmentId, submittedAt: { not: null }, assignment: { classroom: { teacherId } } }, select: { attemptId: true, studentId: true, readAloudTask: { select: { maxScore: true } } } });
      if (!item) return { status: "NOT_FOUND" };
      const manualMax = Number(item.readAloudTask.maxScore);
      if (score < 0 || score > manualMax) return { status: "INVALID", message: `Điểm đọc phải từ 0 đến ${manualMax}.` };
      const now = new Date();
      const submission = await tx.assignmentReadAloudSubmission.update({ where: { id: submissionId }, data: { score, feedback: feedback?.trim() || null, gradedById: teacherId, gradedAt: now }, select: submissionSelect });
      const auto = await tx.assignmentAnswer.aggregate({ where: { attemptId: item.attemptId }, _sum: { awardedPoints: true } });
      const attempt = await tx.assignmentAttempt.findUnique({ where: { id: item.attemptId }, select: { maxScore: true } });
      const automaticScore = Number(auto._sum.awardedPoints ?? 0);
      const maxScore = Number(attempt?.maxScore ?? 0);
      const outcome = calculateAssignmentOutcome({ automaticScore, automaticMaxScore: maxScore - manualMax, manualMaxScore: manualMax, manualScore: score });
      await tx.assignmentAttempt.update({ where: { id: item.attemptId }, data: outcome });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "ASSIGNMENT_READ_ALOUD_GRADED", entityType: "AssignmentReadAloudSubmission", entityId: submissionId, metadata: { assignmentId, attemptId: item.attemptId, studentId: item.studentId, score, maxScore: manualMax } } });
      return { status: "OK", value: submissionView(submission) };
    });
  }
}
