import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import request from "supertest";
import { RolesGuard } from "../src/access/roles.guard";
import { AuthRepository } from "../src/auth/auth.repository";
import type {
  AuthUser,
  AuthUserWithPassword,
} from "../src/auth/auth.types";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard";
import { ClassroomController } from "../src/classes/classroom.controller";
import { ClassroomRepository } from "../src/classes/classroom.repository";
import { ClassroomService } from "../src/classes/classroom.service";
import type {
  AddStudentResult,
  ClassroomSummary,
  CreateClassInput,
  RemoveStudentResult,
  StudentSummary,
} from "../src/classes/classroom.types";
import { authConfig } from "../src/config/env";

class ClassroomTestAuthRepository extends AuthRepository {
  constructor(private readonly users: AuthUser[]) { super(); }
  async findUserById(id: string) { return this.users.find((user) => user.id === id) ?? null; }
  async createUser(): Promise<AuthUser> { throw new Error("Not used"); }
  async findUserByEmail(): Promise<AuthUserWithPassword | null> { return null; }
  async verifyEmail(): Promise<AuthUser | null> { return null; }
  async createRefreshToken(): Promise<void> {}
  async rotateRefreshToken(): Promise<AuthUser | null> { return null; }
  async revokeRefreshToken(): Promise<void> {}
}

type StoredClass = ClassroomSummary & { teacherId: string; studentIds: Set<string> };

class InMemoryClassroomRepository extends ClassroomRepository {
  private readonly classrooms = new Map<string, StoredClass>();

  constructor(private readonly students: StudentSummary[]) { super(); }

  async create(teacherId: string, input: CreateClassInput): Promise<ClassroomSummary> {
    const classroom: StoredClass = {
      id: randomUUID(),
      teacherId,
      studentIds: new Set(),
      status: "ACTIVE",
      studentCount: 0,
      description: input.description ?? null,
      level: input.level ?? null,
      scheduleNote: input.scheduleNote ?? null,
      ...input,
    };
    this.classrooms.set(classroom.id, classroom);
    return this.summary(classroom);
  }

  async listForTeacher(teacherId: string) {
    return [...this.classrooms.values()]
      .filter((item) => item.teacherId === teacherId)
      .map((item) => this.summary(item));
  }

  async searchStudents(query: string) {
    const normalized = query.toLowerCase();
    return this.students.filter((student) =>
      [student.email, student.fullName, student.studentCode ?? ""]
        .some((value) => value.toLowerCase().includes(normalized)));
  }

  async roster(classroomId: string, teacherId: string) {
    const classroom = this.owned(classroomId, teacherId);
    if (!classroom) return null;
    return this.students.filter((student) => classroom.studentIds.has(student.id));
  }

  async addStudent(
    classroomId: string,
    teacherId: string,
    studentId: string,
  ): Promise<AddStudentResult> {
    const classroom = this.owned(classroomId, teacherId);
    if (!classroom) return { status: "CLASS_NOT_FOUND" };
    const student = this.students.find((item) => item.id === studentId);
    if (!student) return { status: "STUDENT_NOT_FOUND" };
    if (classroom.studentIds.has(studentId)) return { status: "ALREADY_ENROLLED" };
    if (classroom.studentIds.size >= classroom.maxStudents) return { status: "CLASS_FULL" };
    classroom.studentIds.add(studentId);
    return { status: "ADDED", student };
  }

  async removeStudent(
    classroomId: string,
    teacherId: string,
    studentId: string,
  ): Promise<RemoveStudentResult> {
    const classroom = this.owned(classroomId, teacherId);
    if (!classroom) return "CLASS_NOT_FOUND";
    return classroom.studentIds.delete(studentId) ? "REMOVED" : "ENROLLMENT_NOT_FOUND";
  }

  private owned(id: string, teacherId: string) {
    const classroom = this.classrooms.get(id);
    return classroom?.teacherId === teacherId ? classroom : null;
  }

  private summary(classroom: StoredClass): ClassroomSummary {
    return {
      id: classroom.id,
      code: classroom.code,
      name: classroom.name,
      description: classroom.description,
      level: classroom.level,
      scheduleNote: classroom.scheduleNote,
      maxStudents: classroom.maxStudents,
      status: classroom.status,
      studentCount: classroom.studentIds.size,
    };
  }
}

describe("Classroom API", () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let jwt: JwtService;
  const teacherId = randomUUID();
  const otherTeacherId = randomUUID();
  const studentId = randomUUID();
  const adminId = randomUUID();

  const users: AuthUser[] = [
    { id: teacherId, email: "teacher@class.test", phone: null, fullName: "Teacher One", status: "ACTIVE", roles: ["TEACHER"] },
    { id: otherTeacherId, email: "teacher2@class.test", phone: null, fullName: "Teacher Two", status: "ACTIVE", roles: ["TEACHER"] },
    { id: studentId, email: "learner@class.test", phone: null, fullName: "Nguyễn Học Sinh", status: "ACTIVE", roles: ["STUDENT"] },
    { id: adminId, email: "admin@class.test", phone: null, fullName: "Admin", status: "ACTIVE", roles: ["ADMIN"] },
  ];
  const students: StudentSummary[] = [
    { id: studentId, email: "learner@class.test", fullName: "Nguyễn Học Sinh", studentCode: "HV100" },
  ];

  before(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig.accessSecret() })],
      controllers: [ClassroomController],
      providers: [
        ClassroomService,
        JwtAuthGuard,
        RolesGuard,
        { provide: AuthRepository, useValue: new ClassroomTestAuthRepository(users) },
        { provide: ClassroomRepository, useValue: new InMemoryClassroomRepository(students) },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();
    jwt = moduleRef.get(JwtService);
  });

  after(async () => { await app.close(); });

  async function tokenFor(user: AuthUser) {
    return jwt.signAsync(
      { sub: user.id, email: user.email, roles: user.roles },
      {
        secret: authConfig.accessSecret(),
        expiresIn: 900,
        issuer: authConfig.accessIssuer(),
        audience: authConfig.accessAudience(),
      },
    );
  }

  test("teacher creates a class and manages its roster", async () => {
    const teacherToken = await tokenFor(users[0]);
    const otherTeacherToken = await tokenFor(users[1]);
    const studentToken = await tokenFor(users[2]);
    const adminToken = await tokenFor(users[3]);

    await request(httpServer)
      .post("/classes")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ name: "Unauthorized" })
      .expect(403);
    await request(httpServer)
      .post("/classes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin cannot own a teaching class" })
      .expect(403);

    const created = await request(httpServer)
      .post("/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        name: "English Foundation A1",
        level: "A1",
        scheduleNote: "Thứ 3 và Thứ 5 · 19:00",
        maxStudents: 20,
      })
      .expect(201);
    const classroomId = created.body.id as string;

    await request(httpServer)
      .get("/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.length !== 1 || body[0].studentCount !== 0) throw new Error("Class list is wrong.");
      });

    await request(httpServer)
      .get("/classes/students/search?q=learner")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body[0]?.id !== studentId) throw new Error("Student search failed.");
      });

    await request(httpServer)
      .post(`/classes/${classroomId}/students`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ studentId })
      .expect(201);
    await request(httpServer)
      .post(`/classes/${classroomId}/students`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ studentId })
      .expect(409);

    await request(httpServer)
      .get(`/classes/${classroomId}/students`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.studentCount !== 1) throw new Error("Roster count is wrong.");
      });
    await request(httpServer)
      .get(`/classes/${classroomId}/students`)
      .set("Authorization", `Bearer ${otherTeacherToken}`)
      .expect(404);

    await request(httpServer)
      .delete(`/classes/${classroomId}/students/${studentId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect({ success: true });
  });

  test("validates class data and search terms", async () => {
    const teacherToken = await tokenFor(users[0]);
    await request(httpServer)
      .post("/classes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ name: "", maxStudents: 0, unknown: true })
      .expect(400);
    await request(httpServer)
      .get("/classes/students/search?q=x")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(400);
  });
});
