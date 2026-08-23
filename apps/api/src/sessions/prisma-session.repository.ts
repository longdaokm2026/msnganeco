import { Injectable } from "@nestjs/common";
import {
  AbsenceRequestStatus,
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { SessionRepository } from "./session.repository";
import type {
  AbsenceRequestResult,
  AttendanceRow,
  CreateSessionInput,
  CreateSessionResult,
  MarkAttendanceResult,
  OwnedResult,
  ReviewAbsenceResult,
  SessionSummary,
  StudentSession,
} from "./session.types";

type SessionWithClass = Prisma.ClassSessionGetPayload<{
  include: { classroom: { select: { name: true } } };
}>;

function summary(session: SessionWithClass): SessionSummary {
  return {
    id: session.id,
    classroomId: session.classroomId,
    classroomName: session.classroom.name,
    title: session.title,
    topic: session.topic,
    scheduledStart: session.scheduledStart.toISOString(),
    scheduledEnd: session.scheduledEnd.toISOString(),
    status: session.status,
  };
}

@Injectable()
export class PrismaSessionRepository extends SessionRepository {
  async createSession(
    teacherId: string,
    classroomId: string,
    input: CreateSessionInput,
  ): Promise<CreateSessionResult> {
    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, teacherId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!classroom) return { status: "NOT_FOUND" };
    try {
      const session = await prisma.$transaction(async (tx) => {
        const created = await tx.classSession.create({
          data: { classroomId, ...input },
          include: { classroom: { select: { name: true } } },
        });
        await tx.auditLog.create({
          data: {
            actorId: teacherId,
            action: "CLASS_SESSION_CREATED",
            entityType: "ClassSession",
            entityId: created.id,
          },
        });
        return created;
      });
      return { status: "OK", value: summary(session) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { status: "DUPLICATE" };
      }
      throw error;
    }
  }

  async listClassSessions(
    teacherId: string,
    classroomId: string,
  ): Promise<OwnedResult<SessionSummary[]>> {
    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, teacherId }, select: { id: true },
    });
    if (!classroom) return { status: "NOT_FOUND" };
    const sessions = await prisma.classSession.findMany({
      where: { classroomId },
      include: { classroom: { select: { name: true } } },
      orderBy: { scheduledStart: "asc" },
    });
    return { status: "OK", value: sessions.map(summary) };
  }

  async attendanceSheet(
    teacherId: string,
    sessionId: string,
  ): Promise<OwnedResult<{ session: SessionSummary; rows: AttendanceRow[] }>> {
    const session = await prisma.classSession.findFirst({
      where: { id: sessionId, classroom: { teacherId } },
      include: { classroom: { select: { name: true } } },
    });
    if (!session) return { status: "NOT_FOUND" };
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classroomId: session.classroomId, status: EnrollmentStatus.ACTIVE },
      include: {
        student: { include: { user: { select: { email: true, fullName: true } } } },
      },
      orderBy: { student: { user: { fullName: "asc" } } },
    });
    const [attendances, requests] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { sessionId } }),
      prisma.absenceRequest.findMany({ where: { sessionId } }),
    ]);
    const attendanceByStudent = new Map(attendances.map((item) => [item.studentId, item]));
    const requestByStudent = new Map(requests.map((item) => [item.studentId, item]));
    const rows = enrollments.map(({ student }): AttendanceRow => {
      const attendance = attendanceByStudent.get(student.userId);
      const request = requestByStudent.get(student.userId);
      return {
        studentId: student.userId,
        fullName: student.user.fullName,
        email: student.user.email,
        studentCode: student.studentCode,
        attendanceStatus: attendance?.status ?? null,
        attendanceNote: attendance?.note ?? null,
        absenceRequest: request ? {
          id: request.id,
          reason: request.reason,
          status: request.status,
          reviewNote: request.reviewNote,
        } : null,
      };
    });
    return { status: "OK", value: { session: summary(session), rows } };
  }

  async markAttendance(
    teacherId: string,
    sessionId: string,
    records: { studentId: string; status: string; note?: string }[],
  ): Promise<MarkAttendanceResult> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.classSession.findFirst({
        where: { id: sessionId, classroom: { teacherId } },
      });
      if (!session) return "NOT_FOUND";
      const studentIds = [...new Set(records.map(({ studentId }) => studentId))];
      const enrolled = await tx.classEnrollment.count({
        where: {
          classroomId: session.classroomId,
          studentId: { in: studentIds },
          status: EnrollmentStatus.ACTIVE,
        },
      });
      if (enrolled !== studentIds.length) return "INVALID_STUDENT";
      const now = new Date();
      for (const record of records) {
        await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
          create: {
            sessionId,
            studentId: record.studentId,
            status: record.status as AttendanceStatus,
            note: record.note?.trim() || undefined,
            markedById: teacherId,
          },
          update: {
            status: record.status as AttendanceStatus,
            note: record.note?.trim() || null,
            markedById: teacherId,
            markedAt: now,
          },
        });
      }
      await tx.classSession.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: "ATTENDANCE_SAVED",
          entityType: "ClassSession",
          entityId: sessionId,
          metadata: { recordCount: records.length },
        },
      });
      return "OK";
    });
  }

  async listStudentSessions(studentId: string): Promise<StudentSession[]> {
    const sessions = await prisma.classSession.findMany({
      where: {
        classroom: {
          enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } },
        },
      },
      include: {
        classroom: { select: { name: true } },
        attendances: { where: { studentId } },
        absenceRequests: { where: { studentId } },
      },
      orderBy: { scheduledStart: "asc" },
      take: 50,
    });
    return sessions.map((session) => ({
      ...summary(session),
      attendanceStatus: session.attendances[0]?.status ?? null,
      absenceRequest: session.absenceRequests[0] ? {
        id: session.absenceRequests[0].id,
        reason: session.absenceRequests[0].reason,
        status: session.absenceRequests[0].status,
      } : null,
    }));
  }

  async requestAbsence(
    studentId: string,
    sessionId: string,
    reason: string,
    now: Date,
  ): Promise<AbsenceRequestResult> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.classSession.findUnique({ where: { id: sessionId } });
      if (!session || session.status === "CANCELLED") return { status: "NOT_FOUND" };
      if (session.scheduledStart <= now) return { status: "SESSION_STARTED" };
      const enrollment = await tx.classEnrollment.findFirst({
        where: { classroomId: session.classroomId, studentId, status: EnrollmentStatus.ACTIVE },
      });
      if (!enrollment) return { status: "NOT_ENROLLED" };
      const existing = await tx.absenceRequest.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
      });
      if (
        existing
        && (existing.status === AbsenceRequestStatus.PENDING
          || existing.status === AbsenceRequestStatus.APPROVED)
      ) {
        return { status: "ALREADY_REQUESTED" };
      }
      const request = await tx.absenceRequest.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: { sessionId, studentId, reason },
        update: {
          reason,
          status: AbsenceRequestStatus.PENDING,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: studentId,
          action: "ABSENCE_REQUESTED",
          entityType: "AbsenceRequest",
          entityId: request.id,
        },
      });
      return { status: "OK", requestId: request.id };
    });
  }

  async reviewAbsence(
    teacherId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    note: string | undefined,
    now: Date,
  ): Promise<ReviewAbsenceResult> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.absenceRequest.findFirst({
        where: { id: requestId, session: { classroom: { teacherId } } },
      });
      if (!request) return "NOT_FOUND";
      if (request.status !== AbsenceRequestStatus.PENDING) return "ALREADY_REVIEWED";
      await tx.absenceRequest.update({
        where: { id: requestId },
        data: {
          status: decision,
          reviewedById: teacherId,
          reviewedAt: now,
          reviewNote: note?.trim() || null,
        },
      });
      if (decision === "APPROVED") {
        await tx.attendanceRecord.upsert({
          where: {
            sessionId_studentId: { sessionId: request.sessionId, studentId: request.studentId },
          },
          create: {
            sessionId: request.sessionId,
            studentId: request.studentId,
            status: AttendanceStatus.EXCUSED,
            note: "Đơn xin vắng đã được duyệt",
            markedById: teacherId,
          },
          update: {
            status: AttendanceStatus.EXCUSED,
            note: "Đơn xin vắng đã được duyệt",
            markedById: teacherId,
            markedAt: now,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: `ABSENCE_${decision}`,
          entityType: "AbsenceRequest",
          entityId: requestId,
        },
      });
      return "OK";
    });
  }
}
