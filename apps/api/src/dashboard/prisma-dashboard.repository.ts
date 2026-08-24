import { Injectable } from "@nestjs/common";
import { ClassSessionStatus, EnrollmentStatus } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { summarizeAttendanceStatuses, summarizeStudentAttendance } from "./attendance-report";
import { DashboardRepository } from "./dashboard.repository";
import type {
  TeacherAttendanceReport,
  TeacherAttendanceStudentRow,
  TeacherOverview,
  StudentAttendanceReport,
  StudentOverview,
} from "./dashboard.types";

@Injectable()
export class PrismaDashboardRepository extends DashboardRepository {
  async teacherOverview(
    teacherId: string,
    now: Date,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<TeacherOverview> {
    const [classrooms, todaySessionCount, pendingAbsenceCount] = await Promise.all([
      prisma.classroom.findMany({
        where: { teacherId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              enrollments: { where: { status: EnrollmentStatus.ACTIVE } },
              sessions: true,
            },
          },
          sessions: {
            where: { status: ClassSessionStatus.SCHEDULED, scheduledStart: { gte: now } },
            orderBy: { scheduledStart: "asc" },
            take: 1,
            select: { title: true, scheduledStart: true },
          },
          enrollments: {
            where: { status: EnrollmentStatus.ACTIVE },
            select: { studentId: true },
          },
        },
      }),
      prisma.classSession.count({
        where: {
          classroom: { teacherId },
          status: { not: ClassSessionStatus.CANCELLED },
          scheduledStart: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.absenceRequest.count({
        where: { status: "PENDING", session: { classroom: { teacherId } } },
      }),
    ]);

    const studentIds = new Set(classrooms.flatMap(({ enrollments }) => enrollments.map(({ studentId }) => studentId)));
    const classItems = classrooms.map((classroom) => ({
      id: classroom.id,
      code: classroom.code,
      name: classroom.name,
      studentCount: classroom._count.enrollments,
      sessionCount: classroom._count.sessions,
      nextSession: classroom.sessions[0]
        ? {
            title: classroom.sessions[0].title,
            scheduledStart: classroom.sessions[0].scheduledStart.toISOString(),
          }
        : null,
    }));
    const next = classItems
      .filter((item) => item.nextSession)
      .sort((a, b) => a.nextSession!.scheduledStart.localeCompare(b.nextSession!.scheduledStart))[0];

    return {
      activeClassCount: classrooms.length,
      activeStudentCount: studentIds.size,
      todaySessionCount,
      pendingAbsenceCount,
      nextSession: next?.nextSession
        ? { className: next.name, ...next.nextSession }
        : null,
      classes: classItems,
    };
  }

  async teacherAttendanceReport(
    teacherId: string,
    month: string,
    from: Date,
    to: Date,
  ): Promise<TeacherAttendanceReport> {
    const classrooms = await prisma.classroom.findMany({
      where: { teacherId },
      orderBy: { name: "asc" },
      include: {
        enrollments: {
          where: {
            joinedAt: { lt: to },
            OR: [
              { status: EnrollmentStatus.ACTIVE },
              { removedAt: { gte: from } },
            ],
          },
          orderBy: { student: { user: { fullName: "asc" } } },
          include: {
            student: { include: { user: { select: { fullName: true } } } },
          },
        },
        sessions: {
          where: {
            status: ClassSessionStatus.COMPLETED,
            scheduledStart: { gte: from, lt: to },
          },
          include: { attendances: true, absenceRequests: true },
          orderBy: { scheduledStart: "asc" },
        },
      },
    });

    const students: TeacherAttendanceStudentRow[] = [];
    for (const classroom of classrooms) {
      for (const enrollment of classroom.enrollments) {
        const sessions = classroom.sessions.filter((session) =>
          session.scheduledStart >= enrollment.joinedAt
          && (!enrollment.removedAt || session.scheduledStart <= enrollment.removedAt));
        const summary = summarizeStudentAttendance(sessions.map((session) => ({
          attendanceStatus: session.attendances.find(({ studentId }) => studentId === enrollment.studentId)?.status ?? null,
          absenceStatus: session.absenceRequests.find(({ studentId }) => studentId === enrollment.studentId)?.status ?? null,
        })));
        const row: TeacherAttendanceStudentRow = {
          classroomId: classroom.id,
          classroomName: classroom.name,
          studentId: enrollment.studentId,
          studentCode: enrollment.student.studentCode,
          fullName: enrollment.student.user.fullName,
          ...summary,
        };
        students.push(row);
      }
    }

    const totals = students.reduce<TeacherAttendanceReport["totals"]>(
      (sum, row) => ({
        completedSessions: sum.completedSessions + row.completedSessions,
        present: sum.present + row.present,
        late: sum.late + row.late,
        absent: sum.absent + row.absent,
        approvedAbsence: sum.approvedAbsence + row.approvedAbsence,
        rejectedAbsence: sum.rejectedAbsence + row.rejectedAbsence,
        pendingAbsence: sum.pendingAbsence + row.pendingAbsence,
        billableSessions: sum.billableSessions + row.billableSessions,
      }),
      { completedSessions: 0, present: 0, late: 0, absent: 0, approvedAbsence: 0, rejectedAbsence: 0, pendingAbsence: 0, billableSessions: 0 },
    );
    return { month, totals, students };
  }

  async studentOverview(
    studentId: string,
    now: Date,
    todayStart: Date,
    todayEnd: Date,
    month: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<StudentOverview> {
    const [enrollments, todaySessionCount, pendingAbsenceCount, monthAttendances] = await Promise.all([
      prisma.classEnrollment.findMany({
        where: { studentId, status: EnrollmentStatus.ACTIVE, classroom: { status: "ACTIVE" } },
        orderBy: { classroom: { name: "asc" } },
        include: {
          classroom: {
            include: {
              sessions: {
                where: { status: ClassSessionStatus.SCHEDULED, scheduledStart: { gte: now } },
                orderBy: { scheduledStart: "asc" },
                take: 1,
                select: { title: true, scheduledStart: true },
              },
            },
          },
        },
      }),
      prisma.classSession.count({
        where: {
          classroom: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } },
          status: { not: ClassSessionStatus.CANCELLED },
          scheduledStart: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.absenceRequest.count({ where: { studentId, status: "PENDING" } }),
      prisma.attendanceRecord.findMany({
        where: {
          studentId,
          session: {
            status: ClassSessionStatus.COMPLETED,
            scheduledStart: { gte: monthStart, lt: monthEnd },
          },
        },
        select: { status: true },
      }),
    ]);

    const classes = enrollments.map(({ classroom }) => ({
      id: classroom.id,
      code: classroom.code,
      name: classroom.name,
      scheduleNote: classroom.scheduleNote,
      nextSession: classroom.sessions[0]
        ? { title: classroom.sessions[0].title, scheduledStart: classroom.sessions[0].scheduledStart.toISOString() }
        : null,
    }));
    const nextClass = classes
      .filter((item) => item.nextSession)
      .sort((a, b) => a.nextSession!.scheduledStart.localeCompare(b.nextSession!.scheduledStart))[0];

    return {
      activeClassCount: classes.length,
      todaySessionCount,
      pendingAbsenceCount,
      nextSession: nextClass?.nextSession
        ? { classroomName: nextClass.name, ...nextClass.nextSession }
        : null,
      month,
      monthAttendance: summarizeAttendanceStatuses(monthAttendances.map(({ status }) => status)),
      classes,
    };
  }

  async studentAttendanceReport(
    studentId: string,
    month: string,
    from: Date,
    to: Date,
  ): Promise<StudentAttendanceReport> {
    const attendances = await prisma.attendanceRecord.findMany({
      where: {
        studentId,
        session: {
          status: ClassSessionStatus.COMPLETED,
          scheduledStart: { gte: from, lt: to },
        },
      },
      include: { session: { include: { classroom: { select: { id: true, name: true } } } } },
      orderBy: { session: { scheduledStart: "asc" } },
    });
    const byClass = new Map<string, { classroomName: string; statuses: typeof attendances[number]["status"][] }>();
    for (const attendance of attendances) {
      const current = byClass.get(attendance.session.classroom.id) ?? {
        classroomName: attendance.session.classroom.name,
        statuses: [],
      };
      current.statuses.push(attendance.status);
      byClass.set(attendance.session.classroom.id, current);
    }
    return {
      month,
      totals: summarizeAttendanceStatuses(attendances.map(({ status }) => status)),
      classes: [...byClass.entries()].map(([classroomId, value]) => ({
        classroomId,
        classroomName: value.classroomName,
        ...summarizeAttendanceStatuses(value.statuses),
      })),
    };
  }
}
