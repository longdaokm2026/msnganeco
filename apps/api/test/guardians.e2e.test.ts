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
import { GuardianController } from "../src/guardians/guardian.controller";
import { GuardianRepository } from "../src/guardians/guardian.repository";
import { GuardianService } from "../src/guardians/guardian.service";
import type {
  GuardianStudentLink,
  GuardianStudentOverview,
  RequestLinkResult,
  ReviewLinkResult,
  RevokeLinkResult,
  StudentGuardianLink,
} from "../src/guardians/guardian.types";

class GuardianTestAuthRepository extends AuthRepository {
  constructor(private readonly users: AuthUser[]) { super(); }
  async findUserById(id: string) { return this.users.find((user) => user.id === id) ?? null; }
  async createUser(): Promise<AuthUser> { throw new Error("Not used"); }
  async findUserByEmail(): Promise<AuthUserWithPassword | null> { return null; }
  async verifyEmail(): Promise<AuthUser | null> { return null; }
  async createRefreshToken(): Promise<void> {}
  async rotateRefreshToken(): Promise<AuthUser | null> { return null; }
  async revokeRefreshToken(): Promise<void> {}
}

class InMemoryGuardianRepository extends GuardianRepository {
  private status: GuardianStudentLink["status"] | null = null;

  constructor(
    private readonly guardianId: string,
    private readonly studentId: string,
    private readonly studentEmail: string,
  ) { super(); }

  async requestLink(
    guardianId: string,
    studentEmail: string,
    relationship: string,
  ): Promise<RequestLinkResult> {
    if (studentEmail !== this.studentEmail) return { status: "STUDENT_NOT_FOUND" };
    if (guardianId !== this.guardianId) return { status: "STUDENT_NOT_FOUND" };
    if (this.status === "PENDING") return { status: "ALREADY_PENDING" };
    if (this.status === "ACTIVE") return { status: "ALREADY_ACTIVE" };
    this.status = "PENDING";
    return { status: "CREATED", value: this.guardianLink(relationship) };
  }

  async listForGuardian(guardianId: string): Promise<GuardianStudentLink[]> {
    return guardianId === this.guardianId && this.status && this.status !== "REVOKED"
      ? [this.guardianLink("MOTHER")]
      : [];
  }

  async listForStudent(studentId: string): Promise<StudentGuardianLink[]> {
    return studentId === this.studentId && this.status && this.status !== "REVOKED"
      ? [this.studentLink()]
      : [];
  }

  async reviewLink(
    studentId: string,
    guardianId: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<ReviewLinkResult> {
    if (studentId !== this.studentId || guardianId !== this.guardianId || !this.status) return "NOT_FOUND";
    if (this.status !== "PENDING") return "NOT_PENDING";
    this.status = decision === "APPROVED" ? "ACTIVE" : "REJECTED";
    return "OK";
  }

  async revokeByGuardian(guardianId: string, studentId: string): Promise<RevokeLinkResult> {
    return this.revoke(guardianId, studentId);
  }

  async revokeByStudent(studentId: string, guardianId: string): Promise<RevokeLinkResult> {
    return this.revoke(guardianId, studentId);
  }

  async studentOverview(guardianId: string, studentId: string) {
    if (guardianId !== this.guardianId || studentId !== this.studentId || this.status !== "ACTIVE") {
      return { status: "NOT_FOUND" as const };
    }
    const value: GuardianStudentOverview = {
      student: {
        id: this.studentId,
        fullName: "Nguyễn Học Sinh",
        email: this.studentEmail,
        studentCode: "HV300",
        schoolName: "THCS Test",
      },
      classes: [{
        id: randomUUID(), code: "MSN-A1", name: "English A1", level: "A1",
        teacherName: "Teacher", scheduleNote: "Thứ 3 · 19:00",
      }],
      attendanceSummary: { total: 2, present: 1, absent: 0, late: 1, excused: 0, attendanceRate: 100 },
      upcomingSessions: [],
      recentAttendance: [],
    };
    return { status: "OK" as const, value };
  }

  private guardianLink(relationship: string): GuardianStudentLink {
    return {
      studentId: this.studentId,
      fullName: "Nguyễn Học Sinh",
      email: this.studentEmail,
      studentCode: "HV300",
      relationship,
      status: this.status ?? "PENDING",
      isPrimaryContact: this.status === "ACTIVE",
      requestedAt: new Date().toISOString(),
      respondedAt: this.status === "ACTIVE" ? new Date().toISOString() : null,
    };
  }

  private studentLink(): StudentGuardianLink {
    return {
      guardianId: this.guardianId,
      fullName: "Phụ Huynh",
      email: "guardian@links.test",
      phone: "0900000000",
      relationship: "MOTHER",
      status: this.status ?? "PENDING",
      isPrimaryContact: this.status === "ACTIVE",
      requestedAt: new Date().toISOString(),
      respondedAt: this.status === "ACTIVE" ? new Date().toISOString() : null,
    };
  }

  private revoke(guardianId: string, studentId: string): RevokeLinkResult {
    if (guardianId !== this.guardianId || studentId !== this.studentId || !["PENDING", "ACTIVE"].includes(this.status ?? "")) {
      return "NOT_FOUND";
    }
    this.status = "REVOKED";
    return "OK";
  }
}

describe("Guardian links API", () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let jwt: JwtService;
  const guardianId = randomUUID();
  const otherGuardianId = randomUUID();
  const studentId = randomUUID();
  const otherStudentId = randomUUID();
  const adminId = randomUUID();
  const studentEmail = "student@links.test";
  const users: AuthUser[] = [
    { id: guardianId, email: "guardian@links.test", phone: null, fullName: "Guardian", status: "ACTIVE", roles: ["GUARDIAN"] },
    { id: otherGuardianId, email: "other.guardian@links.test", phone: null, fullName: "Other Guardian", status: "ACTIVE", roles: ["GUARDIAN"] },
    { id: studentId, email: studentEmail, phone: null, fullName: "Student", status: "ACTIVE", roles: ["STUDENT"] },
    { id: otherStudentId, email: "other.student@links.test", phone: null, fullName: "Other Student", status: "ACTIVE", roles: ["STUDENT"] },
    { id: adminId, email: "admin@links.test", phone: null, fullName: "Admin", status: "ACTIVE", roles: ["ADMIN"] },
  ];

  before(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig.accessSecret() })],
      controllers: [GuardianController],
      providers: [
        GuardianService,
        JwtAuthGuard,
        RolesGuard,
        { provide: AuthRepository, useValue: new GuardianTestAuthRepository(users) },
        { provide: GuardianRepository, useValue: new InMemoryGuardianRepository(guardianId, studentId, studentEmail) },
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
        secret: authConfig.accessSecret(), expiresIn: 900,
        issuer: authConfig.accessIssuer(), audience: authConfig.accessAudience(),
      },
    );
  }

  test("guardian requests access and student must approve before overview is visible", async () => {
    const guardianToken = await tokenFor(users[0]);
    const otherGuardianToken = await tokenFor(users[1]);
    const studentToken = await tokenFor(users[2]);
    const otherStudentToken = await tokenFor(users[3]);
    const adminToken = await tokenFor(users[4]);

    await request(httpServer)
      .post("/guardian/student-links")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ studentEmail, relationship: "MOTHER" })
      .expect(403);
    await request(httpServer)
      .post("/guardian/student-links")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ studentEmail, relationship: "MOTHER" })
      .expect(403);

    await request(httpServer)
      .post("/guardian/student-links")
      .set("Authorization", `Bearer ${guardianToken}`)
      .send({ studentEmail: "missing@links.test", relationship: "MOTHER" })
      .expect(404);

    await request(httpServer)
      .post("/guardian/student-links")
      .set("Authorization", `Bearer ${guardianToken}`)
      .send({ studentEmail, relationship: "MOTHER" })
      .expect(201)
      .expect(({ body }) => {
        if (body.status !== "PENDING") throw new Error("Link must start pending.");
      });

    await request(httpServer)
      .get(`/guardian/students/${studentId}/overview`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(404);

    await request(httpServer)
      .get("/student/guardian-links")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body[0]?.guardianId !== guardianId || body[0]?.status !== "PENDING") {
          throw new Error("Student did not receive the pending request.");
        }
      });

    await request(httpServer)
      .patch(`/student/guardian-links/${guardianId}`)
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({ decision: "APPROVED" })
      .expect(404);

    await request(httpServer)
      .patch(`/student/guardian-links/${guardianId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ decision: "APPROVED" })
      .expect(200)
      .expect({ success: true, status: "ACTIVE" });

    await request(httpServer)
      .get(`/guardian/students/${studentId}/overview`)
      .set("Authorization", `Bearer ${otherGuardianToken}`)
      .expect(404);
    await request(httpServer)
      .get(`/guardian/students/${studentId}/overview`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.attendanceSummary.attendanceRate !== 100) throw new Error("Overview is incorrect.");
      });

    await request(httpServer)
      .patch(`/student/guardian-links/${guardianId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ decision: "REJECTED" })
      .expect(409);

    await request(httpServer)
      .delete(`/student/guardian-links/${guardianId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200)
      .expect({ success: true });

    await request(httpServer)
      .get(`/guardian/students/${studentId}/overview`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(404);
  });

  test("validates guardian request data", async () => {
    const guardianToken = await tokenFor(users[0]);
    await request(httpServer)
      .post("/guardian/student-links")
      .set("Authorization", `Bearer ${guardianToken}`)
      .send({ studentEmail: "not-an-email", relationship: "UNKNOWN", extra: true })
      .expect(400);
  });
});
