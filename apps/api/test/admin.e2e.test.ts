import "dotenv/config";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import request from "supertest";
import { RolesGuard } from "../src/access/roles.guard";
import { AdminController } from "../src/admin/admin.controller";
import { AdminRepository } from "../src/admin/admin.repository";
import { AdminService } from "../src/admin/admin.service";
import type { AdminAuditQuery, AdminClassroomQuery, AdminOverview, AdminUserQuery, Page } from "../src/admin/admin.types";
import { AuthRepository } from "../src/auth/auth.repository";
import type { AuthUser, AuthUserWithPassword } from "../src/auth/auth.types";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard";
import { authConfig } from "../src/config/env";

type StoredUser = AuthUser & { createdAt: string; emailVerifiedAt: string | null };
type Teacher = { userId: string; approvalStatus: "PENDING" | "APPROVED" | "REJECTED"; user: StoredUser };
type Audit = { id: string; actorId: string; action: string; entityType: string; entityId: string; createdAt: string };

class AdminTestAuthRepository extends AuthRepository {
  constructor(private readonly users: StoredUser[]) { super(); }
  async findUserById(id: string) { return this.users.find((user) => user.id === id) ?? null; }
  async createUser(): Promise<AuthUser> { throw new Error("Not used"); }
  async findUserByEmail(): Promise<AuthUserWithPassword | null> { return null; }
  async verifyEmail(): Promise<AuthUser | null> { return null; }
  async createRefreshToken(): Promise<void> {}
  async rotateRefreshToken(): Promise<AuthUser | null> { return null; }
  async revokeRefreshToken(): Promise<void> {}
}

class InMemoryAdminRepository extends AdminRepository {
  readonly audits: Audit[] = [];
  constructor(readonly users: StoredUser[], readonly teachers: Teacher[], readonly classrooms: Record<string, unknown>[]) { super(); }
  async overview(): Promise<AdminOverview> {
    const roleCount = (role: AuthUser["roles"][number]) => this.users.filter((user) => user.roles.includes(role)).length;
    return {
      users: { total: this.users.length, active: this.users.filter((u) => u.status === "ACTIVE").length, pendingVerification: this.users.filter((u) => u.status === "PENDING_VERIFICATION").length, disabled: this.users.filter((u) => u.status === "DISABLED").length },
      roles: { ADMIN: roleCount("ADMIN"), TEACHER: roleCount("TEACHER"), STUDENT: roleCount("STUDENT"), GUARDIAN: roleCount("GUARDIAN") },
      teachers: { active: this.teachers.filter((t) => t.approvalStatus === "APPROVED").length, pending: this.teachers.filter((t) => t.approvalStatus === "PENDING").length },
      classrooms: { total: this.classrooms.length, active: this.classrooms.filter((c) => c.status === "ACTIVE").length }, registrationsToday: 1,
    };
  }
  async listUsers(query: AdminUserQuery): Promise<Page<unknown>> {
    let items = this.users.filter((user) => (!query.search || `${user.email} ${user.fullName}`.toLowerCase().includes(query.search.toLowerCase())) && (!query.role || user.roles.includes(query.role)) && (!query.status || user.status === query.status));
    const total = items.length; items = items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) };
  }
  async userDetail(userId: string) { return this.users.find((user) => user.id === userId) ?? null; }
  async updateUserStatus(actorId: string, userId: string, status: AuthUser["status"]) {
    if (actorId === userId && status === "DISABLED") return "SELF_DISABLED" as const;
    const user = this.users.find((item) => item.id === userId); if (!user) return "NOT_FOUND" as const;
    user.status = status; this.audit(actorId, "USER_STATUS_CHANGED", "User", userId); return "UPDATED" as const;
  }
  async pendingTeachers(page: number, pageSize: number): Promise<Page<unknown>> {
    const items = this.teachers.filter((teacher) => teacher.approvalStatus === "PENDING");
    return { items, total: items.length, page, pageSize, totalPages: Math.ceil(items.length / pageSize) };
  }
  async reviewTeacher(actorId: string, userId: string, decision: "APPROVED" | "REJECTED") {
    const teacher = this.teachers.find((item) => item.userId === userId); if (!teacher) return "NOT_FOUND" as const;
    if (teacher.approvalStatus !== "PENDING") return "ALREADY_REVIEWED" as const;
    teacher.approvalStatus = decision; this.audit(actorId, decision === "APPROVED" ? "TEACHER_APPROVED" : "TEACHER_REJECTED", "TeacherProfile", userId); return "UPDATED" as const;
  }
  async listClassrooms(query: AdminClassroomQuery): Promise<Page<unknown>> {
    const items = this.classrooms.filter((item) => !query.search || String(item.name).toLowerCase().includes(query.search.toLowerCase()));
    return { items, total: items.length, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(items.length / query.pageSize) };
  }
  async classroomDetail(classroomId: string) { return this.classrooms.find((item) => item.id === classroomId) ?? null; }
  async listAuditLogs(query: AdminAuditQuery): Promise<Page<unknown>> {
    const items = this.audits.filter((item) => (!query.action || item.action.includes(query.action)) && (!query.actorId || item.actorId === query.actorId));
    return { items, total: items.length, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(items.length / query.pageSize) };
  }
  private audit(actorId: string, action: string, entityType: string, entityId: string) { this.audits.unshift({ id: randomUUID(), actorId, action, entityType, entityId, createdAt: new Date().toISOString() }); }
}

describe("Admin API", () => {
  let app: INestApplication; let httpServer: Parameters<typeof request>[0]; let jwt: JwtService; let repository: InMemoryAdminRepository;
  const adminId = randomUUID(), studentId = randomUUID(), teacherApproveId = randomUUID(), teacherRejectId = randomUUID(), classroomId = randomUUID();
  const users: StoredUser[] = [
    { id: adminId, email: "admin@msngan.test", phone: null, fullName: "Admin Root", status: "ACTIVE", roles: ["ADMIN"], createdAt: new Date().toISOString(), emailVerifiedAt: new Date().toISOString() },
    { id: studentId, email: "student@msngan.test", phone: null, fullName: "Nguyễn Học Sinh", status: "ACTIVE", roles: ["STUDENT"], createdAt: new Date().toISOString(), emailVerifiedAt: new Date().toISOString() },
    { id: teacherApproveId, email: "approve@msngan.test", phone: null, fullName: "Teacher Approve", status: "ACTIVE", roles: ["TEACHER"], createdAt: new Date().toISOString(), emailVerifiedAt: new Date().toISOString() },
    { id: teacherRejectId, email: "reject@msngan.test", phone: null, fullName: "Teacher Reject", status: "ACTIVE", roles: ["TEACHER"], createdAt: new Date().toISOString(), emailVerifiedAt: new Date().toISOString() },
  ];

  before(async () => {
    repository = new InMemoryAdminRepository(users, [
      { userId: teacherApproveId, approvalStatus: "PENDING", user: users[2] },
      { userId: teacherRejectId, approvalStatus: "PENDING", user: users[3] },
    ], [{ id: classroomId, name: "English A1", code: "MSN-A1", status: "ACTIVE", teacher: { id: teacherApproveId }, students: [], capacity: { current: 0, maximum: 20 }, upcomingSessions: [] }]);
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig.accessSecret() })], controllers: [AdminController],
      providers: [AdminService, JwtAuthGuard, RolesGuard, { provide: AuthRepository, useValue: new AdminTestAuthRepository(users) }, { provide: AdminRepository, useValue: repository }],
    }).compile();
    app = moduleRef.createNestApplication(); await app.init(); httpServer = app.getHttpServer(); jwt = moduleRef.get(JwtService);
  });
  after(async () => { await app.close(); });
  async function token(user: StoredUser) { return jwt.signAsync({ sub: user.id, email: user.email, roles: user.roles }, { secret: authConfig.accessSecret(), expiresIn: 900, issuer: authConfig.accessIssuer(), audience: authConfig.accessAudience() }); }

  test("overview requires ADMIN and returns real repository counts", async () => {
    await request(httpServer).get("/admin/overview").set("Authorization", `Bearer ${await token(users[1])}`).expect(403);
    const response = await request(httpServer).get("/admin/overview").set("Authorization", `Bearer ${await token(users[0])}`).expect(200);
    assert.equal(response.body.users.total, 4); assert.equal(response.body.teachers.pending, 2); assert.equal(response.body.classrooms.active, 1);
  });

  test("lists/searches/filters users and disables/enables with self protection and audit", async () => {
    const authorization = `Bearer ${await token(users[0])}`;
    const searched = await request(httpServer).get("/admin/users?search=nguy%E1%BB%85n&role=STUDENT&status=ACTIVE").set("Authorization", authorization).expect(200);
    assert.equal(searched.body.total, 1); assert.equal(searched.body.items[0].passwordHash, undefined);
    await request(httpServer).patch(`/admin/users/${studentId}/status`).set("Authorization", authorization).send({ status: "DISABLED" }).expect(200);
    assert.equal(users[1].status, "DISABLED");
    await request(httpServer).patch(`/admin/users/${studentId}/status`).set("Authorization", authorization).send({ status: "ACTIVE" }).expect(200);
    await request(httpServer).patch(`/admin/users/${adminId}/status`).set("Authorization", authorization).send({ status: "DISABLED" }).expect(400);
    assert.equal(repository.audits.filter((item) => item.action === "USER_STATUS_CHANGED").length, 2);
  });

  test("approves/rejects teachers, exposes classrooms read-only and lists audit logs", async () => {
    const authorization = `Bearer ${await token(users[0])}`;
    const pending = await request(httpServer).get("/admin/teachers/pending").set("Authorization", authorization).expect(200); assert.equal(pending.body.total, 2);
    await request(httpServer).post(`/admin/teachers/${teacherApproveId}/approve`).set("Authorization", authorization).send({}).expect(201);
    await request(httpServer).post(`/admin/teachers/${teacherRejectId}/reject`).set("Authorization", authorization).send({ rejectionNote: "Thiếu thông tin" }).expect(201);
    const classes = await request(httpServer).get("/admin/classrooms?search=English").set("Authorization", authorization).expect(200); assert.equal(classes.body.total, 1);
    const detail = await request(httpServer).get(`/admin/classrooms/${classroomId}`).set("Authorization", authorization).expect(200); assert.equal(detail.body.code, "MSN-A1");
    const audits = await request(httpServer).get("/admin/audit-logs?action=TEACHER").set("Authorization", authorization).expect(200); assert.equal(audits.body.total, 2);
  });
});
