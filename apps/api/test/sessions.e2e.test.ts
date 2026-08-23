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
import type { AuthUser, AuthUserWithPassword } from "../src/auth/auth.types";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard";
import { authConfig } from "../src/config/env";
import { SessionController } from "../src/sessions/session.controller";
import { SessionRepository } from "../src/sessions/session.repository";
import { SessionService } from "../src/sessions/session.service";
import type {
  AbsenceRequestResult,
  AttendanceRow,
  CreateSessionInput,
  CreateSessionResult,
  MarkAttendanceResult,
  ReviewAbsenceResult,
  SessionSummary,
  StudentSession,
} from "../src/sessions/session.types";

class SessionTestAuthRepository extends AuthRepository {
  constructor(private readonly users: AuthUser[]) { super(); }
  async findUserById(id: string) { return this.users.find((user) => user.id === id) ?? null; }
  async createUser(): Promise<AuthUser> { throw new Error("Not used"); }
  async findUserByEmail(): Promise<AuthUserWithPassword | null> { return null; }
  async verifyEmail(): Promise<AuthUser | null> { return null; }
  async createRefreshToken(): Promise<void> {}
  async rotateRefreshToken(): Promise<AuthUser | null> { return null; }
  async revokeRefreshToken(): Promise<void> {}
}

type StoredAbsence = NonNullable<AttendanceRow["absenceRequest"]> & { studentId: string };

class InMemorySessionRepository extends SessionRepository {
  private session: SessionSummary | null = null;
  private attendanceStatus: AttendanceRow["attendanceStatus"] = null;
  private absence: StoredAbsence | null = null;

  constructor(
    private readonly classroomId: string,
    private readonly teacherId: string,
    private readonly studentId: string,
  ) { super(); }

  async createSession(
    teacherId: string,
    classroomId: string,
    input: CreateSessionInput,
  ): Promise<CreateSessionResult> {
    if (teacherId !== this.teacherId || classroomId !== this.classroomId) return { status: "NOT_FOUND" };
    if (this.session?.scheduledStart === input.scheduledStart.toISOString()) return { status: "DUPLICATE" };
    this.session = {
      id: randomUUID(),
      classroomId,
      classroomName: "English A1",
      title: input.title,
      topic: input.topic ?? null,
      scheduledStart: input.scheduledStart.toISOString(),
      scheduledEnd: input.scheduledEnd.toISOString(),
      status: "SCHEDULED",
    };
    return { status: "OK", value: this.session };
  }

  async listClassSessions(teacherId: string, classroomId: string) {
    if (teacherId !== this.teacherId || classroomId !== this.classroomId) return { status: "NOT_FOUND" as const };
    return { status: "OK" as const, value: this.session ? [this.session] : [] };
  }

  async attendanceSheet(teacherId: string, sessionId: string) {
    if (!this.owned(teacherId, sessionId)) return { status: "NOT_FOUND" as const };
    return {
      status: "OK" as const,
      value: {
        session: this.session!,
        rows: [{
          studentId: this.studentId,
          fullName: "Nguyễn Học Sinh",
          email: "student@sessions.test",
          studentCode: "HV200",
          attendanceStatus: this.attendanceStatus,
          attendanceNote: null,
          absenceRequest: this.absence,
        }],
      },
    };
  }

  async markAttendance(
    teacherId: string,
    sessionId: string,
    records: { studentId: string; status: string }[],
  ): Promise<MarkAttendanceResult> {
    if (!this.owned(teacherId, sessionId)) return "NOT_FOUND";
    if (records.some(({ studentId }) => studentId !== this.studentId)) return "INVALID_STUDENT";
    this.attendanceStatus = records[0]?.status as AttendanceRow["attendanceStatus"];
    if (this.session) this.session.status = "COMPLETED";
    return "OK";
  }

  async listStudentSessions(studentId: string): Promise<StudentSession[]> {
    if (studentId !== this.studentId || !this.session) return [];
    return [{ ...this.session, attendanceStatus: this.attendanceStatus, absenceRequest: this.absence }];
  }

  async requestAbsence(
    studentId: string,
    sessionId: string,
  ): Promise<AbsenceRequestResult> {
    if (!this.session || sessionId !== this.session.id) return { status: "NOT_FOUND" };
    if (studentId !== this.studentId) return { status: "NOT_ENROLLED" };
    if (this.absence && ["PENDING", "APPROVED"].includes(this.absence.status)) {
      return { status: "ALREADY_REQUESTED" };
    }
    this.absence = {
      id: randomUUID(),
      studentId,
      reason: "Bị ốm",
      status: "PENDING",
      reviewNote: null,
    };
    return { status: "OK", requestId: this.absence.id };
  }

  async reviewAbsence(
    teacherId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    note: string | undefined,
  ): Promise<ReviewAbsenceResult> {
    if (teacherId !== this.teacherId || requestId !== this.absence?.id) return "NOT_FOUND";
    if (this.absence.status !== "PENDING") return "ALREADY_REVIEWED";
    this.absence.status = decision;
    this.absence.reviewNote = note ?? null;
    if (decision === "APPROVED") this.attendanceStatus = "EXCUSED";
    return "OK";
  }

  private owned(teacherId: string, sessionId: string) {
    return teacherId === this.teacherId && sessionId === this.session?.id;
  }
}

describe("Sessions and attendance API", () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let jwt: JwtService;
  const teacherId = randomUUID();
  const otherTeacherId = randomUUID();
  const studentId = randomUUID();
  const classroomId = randomUUID();
  const users: AuthUser[] = [
    { id: teacherId, email: "teacher@sessions.test", phone: null, fullName: "Teacher", status: "ACTIVE", roles: ["TEACHER"] },
    { id: otherTeacherId, email: "other@sessions.test", phone: null, fullName: "Other", status: "ACTIVE", roles: ["TEACHER"] },
    { id: studentId, email: "student@sessions.test", phone: null, fullName: "Student", status: "ACTIVE", roles: ["STUDENT"] },
  ];

  before(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig.accessSecret() })],
      controllers: [SessionController],
      providers: [
        SessionService,
        JwtAuthGuard,
        RolesGuard,
        { provide: AuthRepository, useValue: new SessionTestAuthRepository(users) },
        { provide: SessionRepository, useValue: new InMemorySessionRepository(classroomId, teacherId, studentId) },
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

  test("teacher schedules and marks a class while student requests an excused absence", async () => {
    const teacherToken = await tokenFor(users[0]);
    const otherTeacherToken = await tokenFor(users[1]);
    const studentToken = await tokenFor(users[2]);

    await request(httpServer)
      .post(`/classes/${classroomId}/sessions`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ title: "Unauthorized", scheduledStart: "2099-01-01T10:00:00Z", scheduledEnd: "2099-01-01T11:00:00Z" })
      .expect(403);

    const created = await request(httpServer)
      .post(`/classes/${classroomId}/sessions`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ title: "  Speaking practice  ", topic: "Daily routines", scheduledStart: "2099-01-01T10:00:00Z", scheduledEnd: "2099-01-01T11:00:00Z" })
      .expect(201);
    const sessionId = created.body.id as string;

    await request(httpServer)
      .get(`/classes/${classroomId}/sessions`)
      .set("Authorization", `Bearer ${otherTeacherToken}`)
      .expect(404);

    await request(httpServer)
      .get("/student/sessions")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body[0]?.id !== sessionId) throw new Error("Student schedule is missing.");
      });

    const requested = await request(httpServer)
      .post(`/sessions/${sessionId}/absence-requests`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ reason: "Bị ốm" })
      .expect(201);
    const requestId = requested.body.id as string;

    await request(httpServer)
      .post(`/sessions/${sessionId}/absence-requests`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ reason: "Gửi lại" })
      .expect(409);

    await request(httpServer)
      .get(`/sessions/${sessionId}/attendance`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.rows[0]?.absenceRequest?.status !== "PENDING") throw new Error("Pending request is missing.");
      });

    await request(httpServer)
      .patch(`/absence-requests/${requestId}/review`)
      .set("Authorization", `Bearer ${otherTeacherToken}`)
      .send({ decision: "APPROVED" })
      .expect(404);

    await request(httpServer)
      .patch(`/absence-requests/${requestId}/review`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ decision: "APPROVED", note: "Đã xác nhận" })
      .expect(200)
      .expect({ success: true, status: "APPROVED" });

    await request(httpServer)
      .get(`/sessions/${sessionId}/attendance`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.rows[0]?.attendanceStatus !== "EXCUSED") throw new Error("Approved absence is not excused.");
      });

    await request(httpServer)
      .put(`/sessions/${sessionId}/attendance`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ records: [{ studentId, status: "PRESENT" }, { studentId, status: "LATE" }] })
      .expect(400);

    await request(httpServer)
      .put(`/sessions/${sessionId}/attendance`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ records: [{ studentId, status: "EXCUSED", note: "Đã xin phép" }] })
      .expect(200)
      .expect({ success: true });

    await request(httpServer)
      .patch(`/absence-requests/${requestId}/review`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ decision: "REJECTED" })
      .expect(409);
  });
});
