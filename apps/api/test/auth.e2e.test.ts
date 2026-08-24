import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { authConfig } from "../src/config/env";
import { DashboardRepository } from "../src/dashboard/dashboard.repository";
import type {
  StudentAttendanceReport,
  StudentOverview,
  TeacherAttendanceReport,
  TeacherOverview,
} from "../src/dashboard/dashboard.types";
import { AuthRepository, DuplicateIdentityError } from "../src/auth/auth.repository";
import type {
  AuthUser,
  AuthUserWithPassword,
  CreateUserInput,
  RefreshTokenInput,
  RotateRefreshTokenInput,
} from "../src/auth/auth.types";

type StoredUser = AuthUserWithPassword & {
  verificationTokenHash: string;
  verificationExpiresAt: Date;
};

type StoredRefreshToken = RefreshTokenInput & {
  userId: string;
  familyId: string;
  revokedAt?: Date;
};

class InMemoryAuthRepository extends AuthRepository {
  private readonly users = new Map<string, StoredUser>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();

  seedActiveUser(user: AuthUser) {
    this.users.set(user.id, {
      ...user,
      passwordHash: "not-used-by-this-test",
      verificationTokenHash: "consumed",
      verificationExpiresAt: new Date(0),
    });
  }

  setStatus(email: string, status: AuthUser["status"]) {
    const user = [...this.users.values()].find((candidate) => candidate.email === email);
    if (!user) throw new Error(`Unknown test user: ${email}`);
    user.status = status;
  }

  setRoles(email: string, roles: AuthUser["roles"]) {
    const user = [...this.users.values()].find((candidate) => candidate.email === email);
    if (!user) throw new Error(`Unknown test user: ${email}`);
    user.roles = roles;
  }

  expireVerification(email: string) {
    const user = [...this.users.values()].find((candidate) => candidate.email === email);
    if (!user) throw new Error(`Unknown test user: ${email}`);
    user.verificationExpiresAt = new Date(0);
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const duplicate = [...this.users.values()].some(
      (user) => user.email === input.email || user.phone === input.phone,
    );
    if (duplicate) throw new DuplicateIdentityError();

    const user: StoredUser = {
      id: randomUUID(),
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      status: "PENDING_VERIFICATION",
      roles: [input.role],
      verificationTokenHash: input.verificationTokenHash,
      verificationExpiresAt: input.verificationExpiresAt,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<AuthUserWithPassword | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) ?? null;
  }

  async verifyEmail(tokenHash: string, now: Date): Promise<AuthUser | null> {
    const user = [...this.users.values()].find(
      (candidate) =>
        candidate.verificationTokenHash === tokenHash &&
        candidate.verificationExpiresAt > now,
    );
    if (!user) return null;
    user.verificationTokenHash = "consumed";
    user.status = "ACTIVE";
    return user;
  }

  async createRefreshToken(userId: string, input: RefreshTokenInput): Promise<void> {
    this.refreshTokens.set(input.tokenHash, { userId, familyId: randomUUID(), ...input });
  }

  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
    now: Date,
  ): Promise<AuthUser | null> {
    const current = this.refreshTokens.get(input.currentTokenHash);
    if (!current || current.expiresAt <= now) return null;
    if (current.revokedAt) {
      for (const token of this.refreshTokens.values()) {
        if (token.familyId === current.familyId && !token.revokedAt) token.revokedAt = now;
      }
      return null;
    }

    const user = this.users.get(current.userId);
    if (!user || user.status !== "ACTIVE") return null;

    current.revokedAt = now;
    this.refreshTokens.set(input.tokenHash, {
      userId: current.userId,
      familyId: current.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    return user;
  }

  async revokeRefreshToken(tokenHash: string, now: Date): Promise<void> {
    const token = this.refreshTokens.get(tokenHash);
    if (token) token.revokedAt = now;
  }
}

class InMemoryDashboardRepository extends DashboardRepository {
  async teacherOverview(): Promise<TeacherOverview> {
    return {
      activeClassCount: 1,
      activeStudentCount: 1,
      todaySessionCount: 1,
      pendingAbsenceCount: 1,
      nextSession: {
        className: "English A1",
        title: "Speaking practice",
        scheduledStart: "2099-01-01T10:00:00.000Z",
      },
      classes: [{
        id: randomUUID(),
        code: "MSN-A1",
        name: "English A1",
        studentCount: 1,
        sessionCount: 2,
        nextSession: { title: "Speaking practice", scheduledStart: "2099-01-01T10:00:00.000Z" },
      }],
    };
  }

  async teacherAttendanceReport(_teacherId: string, month: string): Promise<TeacherAttendanceReport> {
    return {
      month,
      totals: { completedSessions: 2, present: 1, late: 0, absent: 1, approvedAbsence: 0, rejectedAbsence: 1, pendingAbsence: 0, billableSessions: 2 },
      students: [{
        classroomId: randomUUID(),
        classroomName: "English A1",
        studentId: randomUUID(),
        studentCode: "HV001",
        fullName: "Nguyễn Minh Anh",
        completedSessions: 2,
        present: 1,
        late: 0,
        absent: 1,
        approvedAbsence: 0,
        rejectedAbsence: 1,
        pendingAbsence: 0,
        billableSessions: 2,
      }],
    };
  }

  async studentOverview(): Promise<StudentOverview> {
    return {
      activeClassCount: 1,
      todaySessionCount: 1,
      pendingAbsenceCount: 1,
      nextSession: {
        classroomName: "English A1",
        title: "Speaking practice",
        scheduledStart: "2099-01-01T10:00:00.000Z",
      },
      month: "2026-08",
      monthAttendance: { total: 3, present: 1, late: 1, absent: 0, excused: 1, attendanceRate: 67 },
      classes: [{
        id: randomUUID(),
        code: "MSN-A1",
        name: "English A1",
        scheduleNote: "Thứ 3, Thứ 5 · 19:00",
        nextSession: { title: "Speaking practice", scheduledStart: "2099-01-01T10:00:00.000Z" },
      }],
    };
  }

  async studentAttendanceReport(_studentId: string, month: string): Promise<StudentAttendanceReport> {
    const summary = { total: 3, present: 1, late: 1, absent: 0, excused: 1, attendanceRate: 67 };
    return {
      month,
      totals: summary,
      classes: [{ classroomId: randomUUID(), classroomName: "English A1", ...summary }],
    };
  }
}

function refreshCookie(response: request.Response) {
  const cookies = response.headers["set-cookie"];
  const values = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  const cookie = values.find((value) => value.startsWith("msngan_refresh="));
  if (!cookie) throw new Error("Refresh cookie was not returned.");
  return cookie.split(";")[0];
}

describe("Auth API", () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let jwt: JwtService;
  let repository: InMemoryAuthRepository;

  before(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useClass(InMemoryAuthRepository)
      .overrideProvider(DashboardRepository)
      .useClass(InMemoryDashboardRepository)
      .compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.use(cookieParser());
    nestApp.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await nestApp.init();
    app = nestApp;
    httpServer = nestApp.getHttpServer();
    jwt = moduleRef.get(JwtService);
    repository = moduleRef.get(AuthRepository) as InMemoryAuthRepository;
  });

  after(async () => {
    await app.close();
  });

  async function registerAndLogin(role: "TEACHER" | "STUDENT" | "GUARDIAN", suffix: string) {
    const account = {
      email: `${role.toLowerCase()}-${suffix}@example.com`,
      fullName: `Tài khoản ${role}`,
      phone: `090${suffix.padStart(7, "0")}`,
      password: "English@123",
      role,
    };
    const registered = await request(httpServer).post("/auth/register").send(account).expect(201);
    await request(httpServer)
      .post("/auth/verify-email")
      .send({ token: registered.body.verificationToken })
      .expect(200);
    const loggedIn = await request(httpServer)
      .post("/auth/login")
      .send({ email: account.email, password: account.password })
      .expect(200);
    return loggedIn.body.accessToken as string;
  }

  test("register, verify, login, refresh, me and logout", async () => {
    const account = {
      email: "student@example.com",
      fullName: "Nguyễn Minh Anh",
      phone: "0912 345 678",
      password: "English@123",
      role: "STUDENT",
      studentCode: "HV001",
    };

    const registered = await request(httpServer).post("/auth/register").send(account).expect(201);
    const verificationToken = registered.body.verificationToken as string;
    if (!verificationToken) throw new Error("Development verification token was not returned.");

    await request(httpServer).post("/auth/register").send(account).expect(409);
    await request(httpServer)
      .post("/auth/login")
      .send({ email: account.email, password: account.password })
      .expect(403);

    await request(httpServer)
      .post("/auth/verify-email")
      .send({ token: verificationToken })
      .expect(200)
      .expect(({ body }) => {
        if (body.user.status !== "ACTIVE") throw new Error("User was not activated.");
      });
    await request(httpServer)
      .post("/auth/verify-email")
      .send({ token: verificationToken })
      .expect(400);

    const loggedIn = await request(httpServer)
      .post("/auth/login")
      .send({ email: account.email, password: account.password })
      .expect(200);
    const firstCookie = refreshCookie(loggedIn);
    const setCookie = loggedIn.headers["set-cookie"]?.toString() ?? "";
    if (!setCookie.includes("HttpOnly") || !setCookie.includes("SameSite=Strict")) {
      throw new Error("Refresh cookie security attributes are missing.");
    }

    await request(httpServer)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.user.email !== account.email) throw new Error("Wrong authenticated user.");
      });

    const refreshed = await request(httpServer)
      .post("/auth/refresh")
      .set("Cookie", firstCookie)
      .expect(200);
    const secondCookie = refreshCookie(refreshed);
    if (secondCookie === firstCookie) throw new Error("Refresh token was not rotated.");

    await request(httpServer).post("/auth/refresh").set("Cookie", firstCookie).expect(401);
    await request(httpServer).post("/auth/refresh").set("Cookie", secondCookie).expect(401);
    await request(httpServer)
      .post("/auth/logout")
      .set("Cookie", secondCookie)
      .expect(200)
      .expect({ success: true });
    await request(httpServer).post("/auth/refresh").set("Cookie", secondCookie).expect(401);
  });

  test("rejects a non-public role", async () => {
    await request(httpServer)
      .post("/auth/register")
      .send({
        email: "admin@example.com",
        fullName: "Admin",
        phone: "0901234567",
        password: "English@123",
        role: "ADMIN",
      })
      .expect(400);
  });

  test("requires authentication for the dashboard", async () => {
    await request(httpServer).get("/dashboard/overview").expect(401);
  });

  test("allows and denies dashboard areas by role", async () => {
    const teacherToken = await registerAndLogin("TEACHER", "101");
    const studentToken = await registerAndLogin("STUDENT", "102");
    const guardianToken = await registerAndLogin("GUARDIAN", "103");
    const adminId = randomUUID();
    repository.seedActiveUser({
      id: adminId,
      email: "admin@example.com",
      phone: "+84900000000",
      fullName: "Quản trị viên",
      status: "ACTIVE",
      roles: ["ADMIN"],
    });
    const adminToken = await jwt.signAsync(
      { sub: adminId, email: "admin@example.com", roles: ["ADMIN"] },
      { secret: authConfig.accessSecret(), expiresIn: 900 },
    );

    await request(httpServer)
      .get("/dashboard/overview")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.primaryRole !== "TEACHER") throw new Error("Wrong teacher dashboard.");
        if (body.metrics[0]?.value !== "1" || body.teacherOverview?.classes?.length !== 1) {
          throw new Error("Teacher dashboard is not using live data.");
        }
      });
    await request(httpServer)
      .get("/dashboard/teacher/attendance?month=2026-08")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.totals?.rejectedAbsence !== 1 || body.totals?.billableSessions !== 2) {
          throw new Error("Rejected absence must remain billable.");
        }
      });
    await request(httpServer)
      .get("/dashboard/teacher/attendance?month=08-2026")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(400);
    await request(httpServer)
      .get("/dashboard/teaching")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200);
    await request(httpServer)
      .get("/dashboard/learning")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);

    await request(httpServer)
      .get("/dashboard/overview")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.primaryRole !== "STUDENT" || body.metrics[0]?.value !== "1") {
          throw new Error("Student dashboard is not using live data.");
        }
        if (body.studentOverview?.monthAttendance?.attendanceRate !== 67) {
          throw new Error("Student attendance snapshot is missing.");
        }
      });
    await request(httpServer)
      .get("/dashboard/student/attendance?month=2026-08")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.totals?.attendanceRate !== 67 || body.classes?.length !== 1) {
          throw new Error("Student monthly attendance report is missing.");
        }
      });
    await request(httpServer)
      .get("/dashboard/student/attendance?month=08-2026")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(400);
    await request(httpServer)
      .get("/dashboard/learning")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);
    await request(httpServer)
      .get("/dashboard/guardian")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(403);
    await request(httpServer)
      .get("/dashboard/teacher/attendance?month=2026-08")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(403);
    await request(httpServer)
      .get("/dashboard/student/attendance?month=2026-08")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);

    await request(httpServer)
      .get("/dashboard/guardian")
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(200);
    await request(httpServer)
      .get("/dashboard/teaching")
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(403);

    for (const area of ["teaching", "learning", "guardian", "administration"]) {
      await request(httpServer)
        .get(`/dashboard/${area}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    }
  });

  test("rejects malformed, expired and deactivated access tokens", async () => {
    await request(httpServer)
      .get("/dashboard/overview")
      .set("Authorization", "Bearer malformed.token")
      .expect(401);

    const userId = randomUUID();
    repository.seedActiveUser({
      id: userId,
      email: "expired-token@example.com",
      phone: "+84900000001",
      fullName: "Expired Token",
      status: "ACTIVE",
      roles: ["STUDENT"],
    });
    const expiredToken = await jwt.signAsync(
      { sub: userId, email: "expired-token@example.com", roles: ["STUDENT"] },
      { secret: authConfig.accessSecret(), expiresIn: -1 },
    );
    await request(httpServer)
      .get("/dashboard/overview")
      .set("Authorization", `Bearer ${expiredToken}`)
      .expect(401);

    const wrongAudienceToken = await jwt.signAsync(
      { sub: userId, email: "expired-token@example.com", roles: ["STUDENT"] },
      {
        secret: authConfig.accessSecret(),
        expiresIn: 900,
        issuer: authConfig.accessIssuer(),
        audience: "another-application",
      },
    );
    await request(httpServer)
      .get("/dashboard/overview")
      .set("Authorization", `Bearer ${wrongAudienceToken}`)
      .expect(401);

    const suspendedToken = await registerAndLogin("STUDENT", "204");
    repository.setStatus("student-204@example.com", "SUSPENDED");
    await request(httpServer)
      .get("/dashboard/overview")
      .set("Authorization", `Bearer ${suspendedToken}`)
      .expect(401);
  });

  test("uses current roles instead of stale roles stored in an access token", async () => {
    const teacherToken = await registerAndLogin("TEACHER", "205");
    repository.setRoles("teacher-205@example.com", ["STUDENT"]);

    await request(httpServer)
      .get("/dashboard/teaching")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);
    await request(httpServer)
      .get("/dashboard/learning")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200);
  });

  test("rejects expired verification tokens and unexpected registration fields", async () => {
    const account = {
      email: "expired-verification@example.com",
      fullName: "Expired Verification",
      phone: "0900000206",
      password: "English@123",
      role: "STUDENT",
    };
    const registered = await request(httpServer).post("/auth/register").send(account).expect(201);
    repository.expireVerification(account.email);
    await request(httpServer)
      .post("/auth/verify-email")
      .send({ token: registered.body.verificationToken })
      .expect(400);

    await request(httpServer)
      .post("/auth/register")
      .send({ ...account, email: "extra-field@example.com", phone: "0900000207", isAdmin: true })
      .expect(400);
  });

  test("does not reveal whether an email exists during failed login", async () => {
    const unknown = await request(httpServer)
      .post("/auth/login")
      .send({ email: "unknown@example.com", password: "WrongPassword123" })
      .expect(401);
    const existing = await request(httpServer)
      .post("/auth/login")
      .send({ email: "student@example.com", password: "WrongPassword123" })
      .expect(401);
    if (unknown.body.message !== existing.body.message) {
      throw new Error("Login failure messages leak account existence.");
    }
  });
});
