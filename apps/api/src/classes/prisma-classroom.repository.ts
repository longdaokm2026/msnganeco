import { Injectable } from "@nestjs/common";
import { EnrollmentStatus, Prisma, UserStatus } from "../../../../generated/prisma/client";
import { prisma } from "../../../../server/database/client";
import { ClassroomRepository, DuplicateClassCodeError } from "./classroom.repository";
import type {
  AddStudentResult,
  ClassroomSummary,
  CreateClassInput,
  RemoveStudentResult,
  StudentSummary,
} from "./classroom.types";

type ClassroomWithCount = Prisma.ClassroomGetPayload<{
  include: { _count: { select: { enrollments: true } } };
}>;

function toClassroom(item: ClassroomWithCount): ClassroomSummary {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    level: item.level,
    scheduleNote: item.scheduleNote,
    maxStudents: item.maxStudents,
    status: item.status,
    studentCount: item._count.enrollments,
  };
}

function toStudent(profile: {
  studentCode: string | null;
  user: { id: string; email: string; fullName: string };
}): StudentSummary {
  return {
    id: profile.user.id,
    email: profile.user.email,
    fullName: profile.user.fullName,
    studentCode: profile.studentCode,
  };
}

@Injectable()
export class PrismaClassroomRepository extends ClassroomRepository {
  async create(teacherId: string, input: CreateClassInput): Promise<ClassroomSummary> {
    try {
      const classroom = await prisma.classroom.create({
        data: { teacherId, ...input },
        include: {
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
        },
      });
      await prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: "CLASSROOM_CREATED",
          entityType: "Classroom",
          entityId: classroom.id,
        },
      });
      return toClassroom(classroom);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateClassCodeError();
      }
      throw error;
    }
  }

  async listForTeacher(teacherId: string): Promise<ClassroomSummary[]> {
    const classrooms = await prisma.classroom.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
      },
    });
    return classrooms.map(toClassroom);
  }

  async searchStudents(query: string): Promise<StudentSummary[]> {
    const profiles = await prisma.studentProfile.findMany({
      where: {
        user: { status: UserStatus.ACTIVE },
        OR: [
          { studentCode: { contains: query, mode: "insensitive" } },
          { user: { email: { contains: query, mode: "insensitive" } } },
          { user: { fullName: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
      take: 10,
    });
    return profiles.map(toStudent);
  }

  async roster(classroomId: string, teacherId: string): Promise<StudentSummary[] | null> {
    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, teacherId },
      select: { id: true },
    });
    if (!classroom) return null;

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classroomId, status: EnrollmentStatus.ACTIVE },
      include: {
        student: {
          include: { user: { select: { id: true, email: true, fullName: true } } },
        },
      },
      orderBy: { student: { user: { fullName: "asc" } } },
    });
    return enrollments.map(({ student }) => toStudent(student));
  }

  async addStudent(
    classroomId: string,
    teacherId: string,
    studentId: string,
  ): Promise<AddStudentResult> {
    return prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.findFirst({
        where: { id: classroomId, teacherId, status: "ACTIVE" },
      });
      if (!classroom) return { status: "CLASS_NOT_FOUND" };

      const student = await tx.studentProfile.findFirst({
        where: { userId: studentId, user: { status: UserStatus.ACTIVE } },
        include: { user: { select: { id: true, email: true, fullName: true } } },
      });
      if (!student) return { status: "STUDENT_NOT_FOUND" };

      const existing = await tx.classEnrollment.findUnique({
        where: { classroomId_studentId: { classroomId, studentId } },
      });
      if (existing?.status === EnrollmentStatus.ACTIVE) return { status: "ALREADY_ENROLLED" };

      const count = await tx.classEnrollment.count({
        where: { classroomId, status: EnrollmentStatus.ACTIVE },
      });
      if (count >= classroom.maxStudents) return { status: "CLASS_FULL" };

      await tx.classEnrollment.upsert({
        where: { classroomId_studentId: { classroomId, studentId } },
        create: { classroomId, studentId },
        update: { status: EnrollmentStatus.ACTIVE, joinedAt: new Date(), removedAt: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: "STUDENT_ADDED_TO_CLASSROOM",
          entityType: "Classroom",
          entityId: classroomId,
          metadata: { studentId },
        },
      });
      return { status: "ADDED", student: toStudent(student) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeStudent(
    classroomId: string,
    teacherId: string,
    studentId: string,
  ): Promise<RemoveStudentResult> {
    return prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.findFirst({
        where: { id: classroomId, teacherId },
        select: { id: true },
      });
      if (!classroom) return "CLASS_NOT_FOUND";

      const removedAt = new Date();
      const updated = await tx.classEnrollment.updateMany({
        where: { classroomId, studentId, status: EnrollmentStatus.ACTIVE },
        data: { status: EnrollmentStatus.REMOVED, removedAt },
      });
      if (updated.count !== 1) return "ENROLLMENT_NOT_FOUND";

      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: "STUDENT_REMOVED_FROM_CLASSROOM",
          entityType: "Classroom",
          entityId: classroomId,
          metadata: { studentId },
        },
      });
      return "REMOVED";
    });
  }
}
