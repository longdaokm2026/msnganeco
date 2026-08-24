import { Injectable } from "@nestjs/common";
import {
  AttendanceStatus,
  GuardianLinkStatus,
  Prisma,
  UserStatus,
} from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { GuardianRepository } from "./guardian.repository";
import type {
  GuardianStudentLink,
  OverviewResult,
  RequestLinkResult,
  ReviewLinkResult,
  RevokeLinkResult,
  StudentGuardianLink,
} from "./guardian.types";

type GuardianLinkWithStudent = Prisma.StudentGuardianGetPayload<{
  include: { student: { include: { user: true } } };
}>;

type StudentLinkWithGuardian = Prisma.StudentGuardianGetPayload<{
  include: { guardian: { include: { user: true } } };
}>;

function guardianView(link: GuardianLinkWithStudent): GuardianStudentLink {
  return {
    studentId: link.studentId,
    fullName: link.student.user.fullName,
    email: link.student.user.email,
    studentCode: link.student.studentCode,
    relationship: link.relationship,
    status: link.status,
    isPrimaryContact: link.isPrimaryContact,
    requestedAt: link.requestedAt.toISOString(),
    respondedAt: link.respondedAt?.toISOString() ?? null,
  };
}

function studentView(link: StudentLinkWithGuardian): StudentGuardianLink {
  return {
    guardianId: link.guardianId,
    fullName: link.guardian.user.fullName,
    email: link.guardian.user.email,
    phone: link.guardian.user.phone,
    relationship: link.relationship,
    status: link.status,
    isPrimaryContact: link.isPrimaryContact,
    requestedAt: link.requestedAt.toISOString(),
    respondedAt: link.respondedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PrismaGuardianRepository extends GuardianRepository {
  async requestLink(
    guardianId: string,
    studentEmail: string,
    relationship: string,
  ): Promise<RequestLinkResult> {
    const student = await prisma.studentProfile.findFirst({
      where: {
        user: { email: studentEmail, status: UserStatus.ACTIVE },
      },
      select: { userId: true },
    });
    if (!student) return { status: "STUDENT_NOT_FOUND" };
    if (student.userId === guardianId) return { status: "SAME_USER" };

    const existing = await prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId: student.userId, guardianId } },
    });
    if (existing?.status === GuardianLinkStatus.PENDING) return { status: "ALREADY_PENDING" };
    if (existing?.status === GuardianLinkStatus.ACTIVE) return { status: "ALREADY_ACTIVE" };

    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.userId, guardianId } },
        create: {
          studentId: student.userId,
          guardianId,
          relationship,
          status: GuardianLinkStatus.PENDING,
          isPrimaryContact: false,
        },
        update: {
          relationship,
          status: GuardianLinkStatus.PENDING,
          isPrimaryContact: false,
          requestedAt: new Date(),
          respondedAt: null,
          revokedAt: null,
        },
        include: { student: { include: { user: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: guardianId,
          action: "GUARDIAN_LINK_REQUESTED",
          entityType: "StudentGuardian",
          entityId: `${student.userId}:${guardianId}`,
        },
      });
      return created;
    });
    return { status: "CREATED", value: guardianView(link) };
  }

  async listForGuardian(guardianId: string) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId, status: { not: GuardianLinkStatus.REVOKED } },
      include: { student: { include: { user: true } } },
      orderBy: { requestedAt: "desc" },
    });
    return links.map(guardianView);
  }

  async listForStudent(studentId: string) {
    const links = await prisma.studentGuardian.findMany({
      where: { studentId, status: { not: GuardianLinkStatus.REVOKED } },
      include: { guardian: { include: { user: true } } },
      orderBy: { requestedAt: "desc" },
    });
    return links.map(studentView);
  }

  async reviewLink(
    studentId: string,
    guardianId: string,
    decision: "APPROVED" | "REJECTED",
    now: Date,
  ): Promise<ReviewLinkResult> {
    return prisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.findUnique({
        where: { studentId_guardianId: { studentId, guardianId } },
      });
      if (!link) return "NOT_FOUND";
      if (link.status !== GuardianLinkStatus.PENDING) return "NOT_PENDING";

      const nextStatus = decision === "APPROVED"
        ? GuardianLinkStatus.ACTIVE
        : GuardianLinkStatus.REJECTED;
      const hasPrimary = decision === "APPROVED" && await tx.studentGuardian.count({
        where: {
          studentId,
          status: GuardianLinkStatus.ACTIVE,
          isPrimaryContact: true,
        },
      }) > 0;
      await tx.studentGuardian.update({
        where: { studentId_guardianId: { studentId, guardianId } },
        data: {
          status: nextStatus,
          respondedAt: now,
          revokedAt: null,
          isPrimaryContact: decision === "APPROVED" && !hasPrimary,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: studentId,
          action: decision === "APPROVED" ? "GUARDIAN_LINK_APPROVED" : "GUARDIAN_LINK_REJECTED",
          entityType: "StudentGuardian",
          entityId: `${studentId}:${guardianId}`,
        },
      });
      return "OK";
    });
  }

  revokeByGuardian(guardianId: string, studentId: string, now: Date) {
    return this.revoke(studentId, guardianId, guardianId, now);
  }

  revokeByStudent(studentId: string, guardianId: string, now: Date) {
    return this.revoke(studentId, guardianId, studentId, now);
  }

  async studentOverview(guardianId: string, studentId: string, now: Date): Promise<OverviewResult> {
    const link = await prisma.studentGuardian.findFirst({
      where: {
        guardianId,
        studentId,
        status: GuardianLinkStatus.ACTIVE,
        canViewAttendance: true,
      },
    });
    if (!link) return { status: "NOT_FOUND" };

    const student = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
      include: { user: true },
    });
    if (!student) return { status: "NOT_FOUND" };

    const [enrollments, attendance, upcoming] = await Promise.all([
      prisma.classEnrollment.findMany({
        where: { studentId, status: "ACTIVE" },
        include: {
          classroom: {
            include: { teacher: { include: { user: { select: { fullName: true } } } } },
          },
        },
        orderBy: { joinedAt: "desc" },
      }),
      prisma.attendanceRecord.findMany({
        where: { studentId },
        include: { session: { include: { classroom: { select: { name: true } } } } },
        orderBy: { session: { scheduledStart: "desc" } },
      }),
      prisma.classSession.findMany({
        where: {
          scheduledStart: { gte: now },
          status: "SCHEDULED",
          classroom: { enrollments: { some: { studentId, status: "ACTIVE" } } },
        },
        include: { classroom: { select: { name: true } } },
        orderBy: { scheduledStart: "asc" },
        take: 20,
      }),
    ]);

    const counts = {
      present: attendance.filter(({ status }) => status === AttendanceStatus.PRESENT).length,
      absent: attendance.filter(({ status }) => status === AttendanceStatus.ABSENT).length,
      late: attendance.filter(({ status }) => status === AttendanceStatus.LATE).length,
      excused: attendance.filter(({ status }) => status === AttendanceStatus.EXCUSED).length,
    };
    const attended = counts.present + counts.late;

    return {
      status: "OK",
      value: {
        student: {
          id: student.userId,
          fullName: student.user.fullName,
          email: student.user.email,
          studentCode: student.studentCode,
          schoolName: student.schoolName,
        },
        classes: enrollments.map(({ classroom }) => ({
          id: classroom.id,
          code: classroom.code,
          name: classroom.name,
          level: classroom.level,
          teacherName: classroom.teacher.user.fullName,
          scheduleNote: classroom.scheduleNote,
        })),
        attendanceSummary: {
          total: attendance.length,
          ...counts,
          attendanceRate: attendance.length ? Math.round(attended / attendance.length * 100) : null,
        },
        upcomingSessions: upcoming.map((session) => ({
          id: session.id,
          classroomName: session.classroom.name,
          title: session.title,
          topic: session.topic,
          scheduledStart: session.scheduledStart.toISOString(),
          scheduledEnd: session.scheduledEnd.toISOString(),
        })),
        recentAttendance: attendance.slice(0, 20).map((record) => ({
          sessionId: record.sessionId,
          classroomName: record.session.classroom.name,
          sessionTitle: record.session.title,
          scheduledStart: record.session.scheduledStart.toISOString(),
          status: record.status,
          note: record.note,
        })),
      },
    };
  }

  private async revoke(
    studentId: string,
    guardianId: string,
    actorId: string,
    now: Date,
  ): Promise<RevokeLinkResult> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.studentGuardian.updateMany({
        where: {
          studentId,
          guardianId,
          status: { in: [GuardianLinkStatus.PENDING, GuardianLinkStatus.ACTIVE] },
        },
        data: {
          status: GuardianLinkStatus.REVOKED,
          isPrimaryContact: false,
          revokedAt: now,
        },
      });
      if (!updated.count) return "NOT_FOUND";
      await tx.auditLog.create({
        data: {
          actorId,
          action: "GUARDIAN_LINK_REVOKED",
          entityType: "StudentGuardian",
          entityId: `${studentId}:${guardianId}`,
        },
      });
      return "OK";
    });
  }
}
