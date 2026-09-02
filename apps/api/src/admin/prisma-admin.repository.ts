import { Injectable } from "@nestjs/common";
import {
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
  Role,
  TeacherApprovalStatus,
  UserStatus,
} from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { AdminRepository } from "./admin.repository";
import type {
  AdminAuditQuery,
  AdminClassroomQuery,
  AdminOverview,
  AdminUserQuery,
  Page,
  TeacherReviewResult,
  UserStatusResult,
  ProfileUpdateResult,
  VerificationResendResult,
  DeleteUserResult,
} from "./admin.types";

const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  status: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

function page<T>(items: T[], total: number, pageNumber: number, pageSize: number): Page<T> {
  return { items, total, page: pageNumber, pageSize, totalPages: Math.ceil(total / pageSize) };
}

function userWhere(query: AdminUserQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: "insensitive" } },
      { fullName: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.role) where.roles = { some: { role: query.role } };
  if (query.status) where.status = query.status;
  return where;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function auditMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function addUuid(target: Set<string>, value: unknown) {
  if (typeof value === "string" && uuidPattern.test(value)) target.add(value);
}

function namedMap<T extends { id: string }>(items: T[], label: (item: T) => string) {
  return new Map(items.map((item) => [item.id, label(item)]));
}

@Injectable()
export class PrismaAdminRepository extends AdminRepository {
  async overview(dayStart: Date, dayEnd: Date): Promise<AdminOverview> {
    const [total, active, pendingVerification, disabled, adminCount, teacherCount, studentCount, guardianCount, activeTeachers, pendingTeachers, totalClasses, activeClasses, registrationsToday] =
      await prisma.$transaction([
        prisma.user.count(),
        prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
        prisma.user.count({ where: { status: UserStatus.PENDING_VERIFICATION } }),
        prisma.user.count({ where: { status: UserStatus.DISABLED } }),
        prisma.userRole.count({ where: { role: Role.ADMIN } }),
        prisma.userRole.count({ where: { role: Role.TEACHER } }),
        prisma.userRole.count({ where: { role: Role.STUDENT } }),
        prisma.userRole.count({ where: { role: Role.GUARDIAN } }),
        prisma.teacherProfile.count({ where: { approvalStatus: TeacherApprovalStatus.APPROVED, user: { status: UserStatus.ACTIVE } } }),
        prisma.teacherProfile.count({ where: { approvalStatus: TeacherApprovalStatus.PENDING } }),
        prisma.classroom.count(),
        prisma.classroom.count({ where: { status: "ACTIVE" } }),
        prisma.user.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      ]);

    const roles = { ADMIN: adminCount, TEACHER: teacherCount, STUDENT: studentCount, GUARDIAN: guardianCount } satisfies Record<Role, number>;
    return {
      users: { total, active, pendingVerification, disabled },
      roles,
      teachers: { active: activeTeachers, pending: pendingTeachers },
      classrooms: { total: totalClasses, active: activeClasses },
      registrationsToday,
    };
  }

  async listUsers(query: AdminUserQuery): Promise<Page<unknown>> {
    const where = userWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: safeUserSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return page(items.map((item) => ({ ...item, roles: item.roles.map(({ role }) => role) })), total, query.page, query.pageSize);
  }

  async userDetail(userId: string): Promise<unknown | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...safeUserSelect,
        teacherProfile: { select: { approvalStatus: true, approvedAt: true, rejectedAt: true, rejectionNote: true } },
        studentProfile: { select: { studentCode: true, schoolName: true, dateOfBirth: true } },
        guardianProfile: { select: { occupation: true } },
        _count: { select: { refreshTokens: true, auditLogs: true } },
      },
    });
    return user ? { ...user, roles: user.roles.map(({ role }) => role) } : null;
  }

  async updateUserStatus(actorId: string, userId: string, status: UserStatus): Promise<UserStatusResult> {
    if (actorId === userId && status === UserStatus.DISABLED) return "SELF_DISABLED";
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) return "NOT_FOUND";
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === UserStatus.DISABLED) {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: status === UserStatus.DISABLED ? "USER_DISABLED" : "USER_ENABLED",
          entityType: "User",
          entityId: userId,
          metadata: { previousStatus: user.status, status },
        },
      });
      return "UPDATED";
    });
  }

  async updateUserProfile(actorId: string, userId: string, input: { fullName?: string; phone?: string | null }): Promise<ProfileUpdateResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!existing) return { status: "NOT_FOUND" };
        const user = await tx.user.update({ where: { id: userId }, data: input, select: safeUserSelect });
        await tx.auditLog.create({ data: { actorId, action: "USER_PROFILE_UPDATED", entityType: "User", entityId: userId, metadata: { changedFields: Object.keys(input) } } });
        return { status: "UPDATED", user: { ...user, roles: user.roles.map(({ role }) => role) } };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { status: "DUPLICATE_PHONE" };
      throw error;
    }
  }

  async createVerificationToken(actorId: string, userId: string, tokenHash: string, expiresAt: Date): Promise<VerificationResendResult> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, status: true } });
      if (!user) return { status: "NOT_FOUND" };
      if (user.emailVerifiedAt) return { status: "ALREADY_VERIFIED" };
      if (user.status === UserStatus.DISABLED) return { status: "DISABLED" };
      const now = new Date();
      await tx.verificationToken.updateMany({ where: { userId, purpose: "EMAIL_VERIFICATION", usedAt: null }, data: { usedAt: now } });
      await tx.verificationToken.create({ data: { userId, purpose: "EMAIL_VERIFICATION", tokenHash, expiresAt } });
      await tx.auditLog.create({ data: { actorId, action: "VERIFICATION_EMAIL_RESENT", entityType: "User", entityId: userId, metadata: { email: user.email } } });
      return { status: "CREATED", email: user.email };
    });
  }

  async deleteUser(actorId: string, userId: string, reason?: string): Promise<DeleteUserResult> {
    if (actorId === userId) return "SELF_DELETE";
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          email: true, roles: { select: { role: true } },
          studentProfile: { select: { _count: { select: { enrollments: true, attendances: true, absenceRequests: true, guardianLinks: true } } } },
          teacherProfile: { select: { _count: { select: { classrooms: true, attendanceMarks: true, reviewedAbsences: true } } } },
          guardianProfile: { select: { _count: { select: { studentLinks: true } } } },
        },
      });
      if (!user) return "NOT_FOUND";
      const studentCounts = user.studentProfile?._count;
      const teacherCounts = user.teacherProfile?._count;
      const guardianCounts = user.guardianProfile?._count;
      const hasDependencies = Boolean(
        (studentCounts && Object.values(studentCounts).some(Boolean)) ||
        (teacherCounts && Object.values(teacherCounts).some(Boolean)) ||
        (guardianCounts && Object.values(guardianCounts).some(Boolean)),
      );
      if (hasDependencies) return "HAS_DEPENDENCIES";
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.studentProfile.deleteMany({ where: { userId } });
      await tx.teacherProfile.deleteMany({ where: { userId } });
      await tx.guardianProfile.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { actorId, action: "USER_DELETED", entityType: "User", entityId: userId, metadata: { email: user.email, roles: user.roles.map(({ role }) => role), ...(reason ? { reason } : {}) } },
      });
      return "DELETED";
    });
  }

  async pendingTeachers(pageNumber: number, pageSize: number): Promise<Page<unknown>> {
    const where = { approvalStatus: TeacherApprovalStatus.PENDING };
    const [items, total] = await prisma.$transaction([
      prisma.teacherProfile.findMany({
        where,
        select: { userId: true, bio: true, createdAt: true, user: { select: safeUserSelect } },
        orderBy: { createdAt: "asc" },
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
      }),
      prisma.teacherProfile.count({ where }),
    ]);
    return page(items.map((item) => ({ ...item, user: { ...item.user, roles: item.user.roles.map(({ role }) => role) } })), total, pageNumber, pageSize);
  }

  async reviewTeacher(
    actorId: string,
    userId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string,
  ): Promise<TeacherReviewResult> {
    return prisma.$transaction(async (tx) => {
      const profile = await tx.teacherProfile.findUnique({ where: { userId }, select: { approvalStatus: true } });
      if (!profile) return "NOT_FOUND";
      if (profile.approvalStatus !== TeacherApprovalStatus.PENDING) return "ALREADY_REVIEWED";
      const now = new Date();
      await tx.teacherProfile.update({
        where: { userId },
        data: decision === "APPROVED"
          ? { approvalStatus: decision, approvedAt: now, approvedById: actorId, rejectedAt: null, rejectionNote: null }
          : { approvalStatus: decision, approvedAt: null, approvedById: null, rejectedAt: now, rejectionNote: note?.trim() || null },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: decision === "APPROVED" ? "TEACHER_APPROVED" : "TEACHER_REJECTED",
          entityType: "TeacherProfile",
          entityId: userId,
          metadata: decision === "REJECTED" && note ? { rejectionNote: note.trim() } : undefined,
        },
      });
      return "UPDATED";
    });
  }

  async listClassrooms(query: AdminClassroomQuery): Promise<Page<unknown>> {
    const where: Prisma.ClassroomWhereInput = {};
    if (query.search) where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ];
    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.status) where.status = query.status;
    const [items, total] = await prisma.$transaction([
      prisma.classroom.findMany({
        where,
        select: {
          id: true, code: true, name: true, level: true, scheduleNote: true, maxStudents: true,
          status: true, createdAt: true,
          teacher: { select: { user: { select: { id: true, fullName: true, email: true } } } },
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.classroom.count({ where }),
    ]);
    return page(items.map(({ teacher, _count, ...item }) => ({ ...item, teacher: teacher.user, studentCount: _count.enrollments })), total, query.page, query.pageSize);
  }

  async classroomDetail(classroomId: string, now: Date): Promise<unknown | null> {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true, code: true, name: true, description: true, level: true, scheduleNote: true,
        maxStudents: true, status: true, createdAt: true, updatedAt: true,
        teacher: { select: { approvalStatus: true, user: { select: { id: true, fullName: true, email: true, phone: true } } } },
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          select: { joinedAt: true, student: { select: { studentCode: true, user: { select: { id: true, fullName: true, email: true } } } } },
          orderBy: { student: { user: { fullName: "asc" } } },
        },
        sessions: {
          where: { scheduledStart: { gte: now }, status: { not: "CANCELLED" } },
          select: { id: true, title: true, topic: true, scheduledStart: true, scheduledEnd: true, status: true,
            _count: { select: { attendances: { where: { status: AttendanceStatus.PRESENT } } } } },
          orderBy: { scheduledStart: "asc" }, take: 10,
        },
      },
    });
    if (!classroom) return null;
    return {
      ...classroom,
      teacher: { ...classroom.teacher.user, approvalStatus: classroom.teacher.approvalStatus },
      students: classroom.enrollments.map(({ joinedAt, student }) => ({ ...student.user, studentCode: student.studentCode, joinedAt })),
      upcomingSessions: classroom.sessions,
      capacity: { current: classroom.enrollments.length, maximum: classroom.maxStudents },
      enrollments: undefined,
      sessions: undefined,
    };
  }

  async listAuditLogs(query: AdminAuditQuery): Promise<Page<unknown>> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = { contains: query.action, mode: "insensitive" };
    if (query.actorId) where.actorId = query.actorId;
    if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true, action: true, entityType: true, entityId: true, metadata: true, ipAddress: true, createdAt: true,
          actor: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    const userIds = new Set<string>();
    const classroomIds = new Set<string>();
    const sessionIds = new Set<string>();
    const lessonIds = new Set<string>();
    const assignmentIds = new Set<string>();
    const attemptIds = new Set<string>();
    const listeningTrackIds = new Set<string>();
    const lessonAttachmentIds = new Set<string>();
    const absenceRequestIds = new Set<string>();
    const speakingTaskIds = new Set<string>();
    const speakingSubmissionIds = new Set<string>();
    const writingTaskIds = new Set<string>();
    const writingSubmissionIds = new Set<string>();

    for (const item of items) {
      const metadata = auditMetadata(item.metadata);
      addUuid(userIds, metadata.studentId);
      addUuid(classroomIds, metadata.classroomId);
      addUuid(sessionIds, metadata.sessionId);
      addUuid(lessonIds, metadata.lessonId);
      addUuid(assignmentIds, metadata.assignmentId);
      addUuid(attemptIds, metadata.attemptId);
      if (Array.isArray(metadata.sourceLessonIds)) {
        for (const lessonId of metadata.sourceLessonIds) addUuid(lessonIds, lessonId);
      }

      const entityTargets: Record<string, Set<string>> = {
        User: userIds,
        TeacherProfile: userIds,
        Classroom: classroomIds,
        ClassSession: sessionIds,
        Lesson: lessonIds,
        LessonAttachment: lessonAttachmentIds,
        Assignment: assignmentIds,
        AssignmentAttempt: attemptIds,
        AssignmentListeningTrack: listeningTrackIds,
        AbsenceRequest: absenceRequestIds,
        AssignmentReadAloudTask: speakingTaskIds,
        AssignmentReadAloudSubmission: speakingSubmissionIds,
        AssignmentWritingTask: writingTaskIds,
        WritingSubmission: writingSubmissionIds,
      };
      const entityTarget = entityTargets[item.entityType];
      if (entityTarget) addUuid(entityTarget, item.entityId);
    }

    const [users, classrooms, sessions, lessons, assignments, attempts, listeningTracks, lessonAttachments, absenceRequests, speakingTasks, speakingSubmissions, writingTasks, writingSubmissions] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, fullName: true, email: true } }),
      prisma.classroom.findMany({ where: { id: { in: [...classroomIds] } }, select: { id: true, name: true, code: true } }),
      prisma.classSession.findMany({ where: { id: { in: [...sessionIds] } }, select: { id: true, title: true, classroom: { select: { name: true } } } }),
      prisma.lesson.findMany({ where: { id: { in: [...lessonIds] } }, select: { id: true, title: true } }),
      prisma.assignment.findMany({ where: { id: { in: [...assignmentIds] } }, select: { id: true, title: true } }),
      prisma.assignmentAttempt.findMany({ where: { id: { in: [...attemptIds] } }, select: { id: true, attemptNumber: true, assignment: { select: { title: true } }, student: { select: { user: { select: { fullName: true } } } } } }),
      prisma.assignmentListeningTrack.findMany({ where: { id: { in: [...listeningTrackIds] } }, select: { id: true, title: true, assignment: { select: { title: true } } } }),
      prisma.lessonAttachment.findMany({ where: { id: { in: [...lessonAttachmentIds] } }, select: { id: true, fileName: true, lesson: { select: { title: true } } } }),
      prisma.absenceRequest.findMany({ where: { id: { in: [...absenceRequestIds] } }, select: { id: true, session: { select: { title: true } }, student: { select: { user: { select: { fullName: true } } } } } }),
      prisma.assignmentReadAloudTask.findMany({ where: { id: { in: [...speakingTaskIds] } }, select: { id: true, title: true, assignment: { select: { title: true } } } }),
      prisma.assignmentReadAloudSubmission.findMany({ where: { id: { in: [...speakingSubmissionIds] } }, select: { id: true, assignment: { select: { title: true } }, student: { select: { user: { select: { fullName: true } } } } } }),
      prisma.assignmentWritingTask.findMany({ where: { id: { in: [...writingTaskIds] } }, select: { id: true, title: true, assignment: { select: { title: true } } } }),
      prisma.writingSubmission.findMany({ where: { id: { in: [...writingSubmissionIds] } }, select: { id: true, writingTask: { select: { title: true, assignment: { select: { title: true } } } }, student: { select: { user: { select: { fullName: true } } } } } }),
    ]);

    const namesByType: Record<string, Map<string, string>> = {
      User: namedMap(users, (item) => `${item.fullName} · ${item.email}`),
      TeacherProfile: namedMap(users, (item) => `${item.fullName} · ${item.email}`),
      Classroom: namedMap(classrooms, (item) => `${item.name} (${item.code})`),
      ClassSession: namedMap(sessions, (item) => `${item.title} · ${item.classroom.name}`),
      Lesson: namedMap(lessons, (item) => item.title),
      Assignment: namedMap(assignments, (item) => item.title),
      AssignmentAttempt: namedMap(attempts, (item) => `Lượt ${item.attemptNumber} · ${item.student.user.fullName} · ${item.assignment.title}`),
      AssignmentListeningTrack: namedMap(listeningTracks, (item) => `${item.title} · ${item.assignment.title}`),
      LessonAttachment: namedMap(lessonAttachments, (item) => `${item.fileName} · ${item.lesson.title}`),
      AbsenceRequest: namedMap(absenceRequests, (item) => `${item.student.user.fullName} · ${item.session.title}`),
      AssignmentReadAloudTask: namedMap(speakingTasks, (item) => `${item.title || "Speaking"} · ${item.assignment.title}`),
      AssignmentReadAloudSubmission: namedMap(speakingSubmissions, (item) => `${item.student.user.fullName} · ${item.assignment.title}`),
      AssignmentWritingTask: namedMap(writingTasks, (item) => `${item.title || "Writing"} · ${item.assignment.title}`),
      WritingSubmission: namedMap(writingSubmissions, (item) => `${item.student.user.fullName} · ${item.writingTask.title || item.writingTask.assignment.title}`),
    };
    const userNames = namesByType.User;
    const classroomNames = namesByType.Classroom;
    const sessionNames = namesByType.ClassSession;
    const lessonNames = namesByType.Lesson;
    const assignmentNames = namesByType.Assignment;
    const attemptNames = namesByType.AssignmentAttempt;

    const enrichedItems = items.map((item) => {
      const metadata = auditMetadata(item.metadata);
      const referenceNames: Record<string, string | string[]> = {};
      const references: Array<[string, unknown, Map<string, string>]> = [
        ["studentId", metadata.studentId, userNames],
        ["classroomId", metadata.classroomId, classroomNames],
        ["sessionId", metadata.sessionId, sessionNames],
        ["lessonId", metadata.lessonId, lessonNames],
        ["assignmentId", metadata.assignmentId, assignmentNames],
        ["attemptId", metadata.attemptId, attemptNames],
      ];
      for (const [key, value, names] of references) {
        if (typeof value === "string") referenceNames[key] = names.get(value) ?? "Đối tượng không còn tồn tại";
      }
      if (Array.isArray(metadata.sourceLessonIds)) {
        referenceNames.sourceLessonIds = metadata.sourceLessonIds.map((value) => typeof value === "string"
          ? lessonNames.get(value) ?? "Bài học không còn tồn tại"
          : "Bài học không xác định");
      }
      const metadataEmail = typeof metadata.email === "string" ? metadata.email : null;
      return {
        ...item,
        displayEntityName: item.entityId ? namesByType[item.entityType]?.get(item.entityId) ?? metadataEmail : metadataEmail,
        referenceNames,
      };
    });
    return page(enrichedItems, total, query.page, query.pageSize);
  }
}
