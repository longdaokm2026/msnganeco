import { Injectable } from "@nestjs/common";
import { EnrollmentStatus, LessonStatus, Prisma, Role, UserStatus } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { LessonRepository } from "./lesson.repository";
import type { AttachmentDeleteResult, AttachmentInput, DownloadRecord, LessonListQuery, LessonResult, LessonTextInput, PublishResult } from "./lesson.types";

const attachmentSelect = { id: true, fileName: true, fileType: true, fileSize: true, category: true, createdAt: true } satisfies Prisma.LessonAttachmentSelect;
const lessonSelect = {
  id: true, sessionId: true, status: true, title: true, summary: true, mainContent: true, theory: true,
  vocabulary: true, grammar: true, examples: true, reviewNotes: true, homeworkNotes: true,
  publishedAt: true, createdAt: true, updatedAt: true,
  updatedBy: { select: { id: true, fullName: true } }, attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" as const } },
  session: { select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, classroom: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.LessonSelect;

function monthRange(month?: string) {
  if (!month) return undefined;
  const [year, number] = month.split("-").map(Number); const offset = 7 * 60 * 60 * 1000;
  return { gte: new Date(Date.UTC(year!, number! - 1, 1) - offset), lt: new Date(Date.UTC(year!, number!, 1) - offset) };
}
function serialize<T extends { attachments?: { id: string }[] }>(lesson: T) {
  return { ...lesson, ...(lesson.attachments ? { attachments: lesson.attachments.map((item) => ({ ...item, downloadUrl: `/lessons/attachments/${item.id}/download` })) } : {}) };
}
function page(items: unknown[], total: number, query: LessonListQuery) { return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) }; }

@Injectable()
export class PrismaLessonRepository extends LessonRepository {
  async listTeacher(teacherId: string, query: LessonListQuery) {
    const where: Prisma.ClassSessionWhereInput = { classroom: { teacherId } };
    if (query.classroomId) where.classroomId = query.classroomId;
    const scheduledStart = monthRange(query.month); if (scheduledStart) where.scheduledStart = scheduledStart;
    if (query.status === LessonStatus.DRAFT) where.OR = [{ lesson: { is: { status: LessonStatus.DRAFT } } }, { lesson: { is: null } }];
    else if (query.status) where.lesson = { is: { status: query.status } };
    const [items, total] = await prisma.$transaction([
      prisma.classSession.findMany({ where, select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, classroom: { select: { id: true, name: true, code: true } }, lesson: { select: { id: true, title: true, status: true, updatedAt: true, publishedAt: true } } }, orderBy: { scheduledStart: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.classSession.count({ where }),
    ]);
    return page(items, total, query);
  }

  async teacherLesson(teacherId: string, sessionId: string): Promise<LessonResult> {
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, classroom: { teacherId } }, select: { id: true, title: true, classroomId: true, lesson: { select: lessonSelect } } });
    if (!session) return { status: "NOT_FOUND" };
    if (session.lesson) return { status: "OK", value: serialize(session.lesson) };
    try {
      const lesson = await prisma.$transaction(async (tx) => {
        const created = await tx.lesson.create({ data: { sessionId, title: session.title, createdById: teacherId, updatedById: teacherId }, select: lessonSelect });
        await tx.auditLog.create({ data: { actorId: teacherId, action: "LESSON_CREATED", entityType: "Lesson", entityId: created.id, metadata: { sessionId, classroomId: session.classroomId } } }); return created;
      });
      return { status: "OK", value: serialize(lesson) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.lesson.findUnique({ where: { sessionId }, select: lessonSelect });
        return existing ? { status: "OK", value: serialize(existing) } : { status: "NOT_FOUND" };
      }
      throw error;
    }
  }

  async update(teacherId: string, sessionId: string, input: LessonTextInput): Promise<LessonResult> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.classSession.findFirst({ where: { id: sessionId, classroom: { teacherId } }, select: { id: true, title: true, classroomId: true, lesson: { select: { id: true } } } });
      if (!session) return { status: "NOT_FOUND" };
      const lesson = await tx.lesson.upsert({ where: { sessionId }, create: { sessionId, title: input.title || session.title, ...input, createdById: teacherId, updatedById: teacherId }, update: { ...input, updatedById: teacherId }, select: lessonSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: session.lesson ? "LESSON_UPDATED" : "LESSON_CREATED", entityType: "Lesson", entityId: lesson.id, metadata: { sessionId, classroomId: session.classroomId } } });
      return { status: "OK", value: serialize(lesson) };
    });
  }

  async publish(teacherId: string, sessionId: string): Promise<PublishResult> {
    return prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.findFirst({ where: { sessionId, session: { classroom: { teacherId } } }, include: { _count: { select: { attachments: true } } } });
      if (!lesson) return { status: "NOT_FOUND" };
      const content = [lesson.summary, lesson.mainContent, lesson.theory, lesson.vocabulary, lesson.grammar, lesson.examples, lesson.reviewNotes, lesson.homeworkNotes];
      if (!lesson.title.trim() || (!content.some((value) => value?.trim()) && lesson._count.attachments === 0)) return { status: "EMPTY" };
      const updated = await tx.lesson.update({ where: { id: lesson.id }, data: { status: LessonStatus.PUBLISHED, publishedAt: lesson.publishedAt ?? new Date(), updatedById: teacherId }, select: lessonSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "LESSON_PUBLISHED", entityType: "Lesson", entityId: lesson.id, metadata: { sessionId, classroomId: updated.session.classroom.id } } });
      return { status: "OK", value: serialize(updated) };
    });
  }

  async archive(teacherId: string, sessionId: string): Promise<LessonResult> {
    return prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.findFirst({ where: { sessionId, session: { classroom: { teacherId } } }, select: { id: true } }); if (!lesson) return { status: "NOT_FOUND" };
      const updated = await tx.lesson.update({ where: { id: lesson.id }, data: { status: LessonStatus.ARCHIVED, updatedById: teacherId }, select: lessonSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "LESSON_ARCHIVED", entityType: "Lesson", entityId: lesson.id, metadata: { sessionId, classroomId: updated.session.classroom.id } } });
      return { status: "OK", value: serialize(updated) };
    });
  }

  async addAttachment(teacherId: string, sessionId: string, input: AttachmentInput): Promise<LessonResult> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.classSession.findFirst({ where: { id: sessionId, classroom: { teacherId } }, select: { title: true, classroomId: true } }); if (!session) return { status: "NOT_FOUND" };
      const lesson = await tx.lesson.upsert({ where: { sessionId }, create: { sessionId, title: session.title, createdById: teacherId, updatedById: teacherId }, update: { updatedById: teacherId } });
      const attachment = await tx.lessonAttachment.create({ data: { lessonId: lesson.id, uploadedById: teacherId, ...input }, select: attachmentSelect });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "LESSON_ATTACHMENT_UPLOADED", entityType: "LessonAttachment", entityId: attachment.id, metadata: { lessonId: lesson.id, sessionId, classroomId: session.classroomId, fileName: input.fileName } } });
      return { status: "OK", value: { ...attachment, downloadUrl: `/lessons/attachments/${attachment.id}/download` } };
    });
  }

  async attachmentForDelete(teacherId: string, sessionId: string, attachmentId: string): Promise<AttachmentDeleteResult> {
    const item = await prisma.lessonAttachment.findFirst({ where: { id: attachmentId, lesson: { sessionId, session: { classroom: { teacherId } } } }, select: { storageKey: true } });
    return item ? { status: "OK", storageKey: item.storageKey } : { status: "NOT_FOUND" };
  }
  async deleteAttachment(teacherId: string, sessionId: string, attachmentId: string): Promise<LessonResult> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.lessonAttachment.findFirst({ where: { id: attachmentId, lesson: { sessionId, session: { classroom: { teacherId } } } }, select: { id: true, fileName: true, lessonId: true } }); if (!item) return { status: "NOT_FOUND" };
      await tx.lessonAttachment.delete({ where: { id: item.id } });
      await tx.auditLog.create({ data: { actorId: teacherId, action: "LESSON_ATTACHMENT_DELETED", entityType: "LessonAttachment", entityId: item.id, metadata: { lessonId: item.lessonId, sessionId, fileName: item.fileName } } });
      return { status: "OK", value: { success: true } };
    });
  }

  async listStudent(studentId: string, query: LessonListQuery) {
    const visible = query.status === LessonStatus.ARCHIVED ? [LessonStatus.ARCHIVED] : query.status === LessonStatus.PUBLISHED ? [LessonStatus.PUBLISHED] : [LessonStatus.PUBLISHED, LessonStatus.ARCHIVED];
    const where: Prisma.LessonWhereInput = { status: { in: visible }, session: { classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } } } };
    if (query.classroomId) where.session = { ...where.session as Prisma.ClassSessionWhereInput, classroomId: query.classroomId };
    const scheduledStart = monthRange(query.month); if (scheduledStart) where.session = { ...where.session as Prisma.ClassSessionWhereInput, scheduledStart };
    const [items, total] = await prisma.$transaction([
      prisma.lesson.findMany({ where, select: { id: true, sessionId: true, title: true, summary: true, status: true, publishedAt: true, updatedAt: true, session: { select: { title: true, scheduledStart: true, classroom: { select: { id: true, name: true, code: true } } } } }, orderBy: { session: { scheduledStart: "desc" } }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.lesson.count({ where }),
    ]); return page(items, total, query);
  }
  async studentLesson(studentId: string, lessonId: string): Promise<LessonResult> {
    const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, status: { in: [LessonStatus.PUBLISHED, LessonStatus.ARCHIVED] }, session: { classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } } } }, select: lessonSelect });
    return lesson ? { status: "OK", value: serialize(lesson) } : { status: "NOT_FOUND" };
  }
  async adminLesson(lessonId: string): Promise<LessonResult> {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: lessonSelect });
    return lesson ? { status: "OK", value: serialize(lesson) } : { status: "NOT_FOUND" };
  }
  async download(userId: string, roles: Role[], attachmentId: string): Promise<DownloadRecord | null> {
    const item = await prisma.lessonAttachment.findUnique({ where: { id: attachmentId }, select: { storageKey: true, fileName: true, fileType: true, lesson: { select: { status: true, session: { select: { classroom: { select: { teacherId: true, enrollments: { where: { studentId: userId, status: EnrollmentStatus.ACTIVE }, select: { studentId: true }, take: 1 } } } } } } } } });
    if (!item) return null;
    const admin = roles.includes(Role.ADMIN);
    const teacher = roles.includes(Role.TEACHER) && item.lesson.session.classroom.teacherId === userId && Boolean(await prisma.teacherProfile.findFirst({ where: { userId, approvalStatus: "APPROVED", user: { status: UserStatus.ACTIVE } }, select: { userId: true } }));
    const student = roles.includes(Role.STUDENT) && item.lesson.status !== LessonStatus.DRAFT && item.lesson.session.classroom.enrollments.length > 0;
    return admin || teacher || student ? { storageKey: item.storageKey, fileName: item.fileName, fileType: item.fileType } : null;
  }
}
