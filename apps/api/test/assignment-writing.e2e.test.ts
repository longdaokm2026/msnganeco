import "dotenv/config";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import request from "supertest";
import { Role, WritingTaskType } from "../../../generated/prisma/client";
import { RolesGuard } from "../src/access/roles.guard";
import { TeacherApprovalRepository } from "../src/access/teacher-approval-access";
import { AuthRepository } from "../src/auth/auth.repository";
import type { AuthUser, AuthUserWithPassword } from "../src/auth/auth.types";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard";
import { authConfig } from "../src/config/env";
import { manualGradeComplete } from "../src/assignments/manual-grading";
import { countWritingWords } from "../src/assignments/prisma-writing.repository";
import { WritingController } from "../src/assignments/writing.controller";
import {
  WritingRepository,
  type TranslationItemInput,
  type WritingResult,
  type WritingTaskInput,
} from "../src/assignments/writing.repository";
import { WritingService } from "../src/assignments/writing.service";

class TestAuth extends AuthRepository {
  constructor(private readonly users: AuthUser[]) { super(); }
  async findUserById(id: string) { return this.users.find((item) => item.id === id) ?? null; }
  async createUser(): Promise<AuthUser> { throw new Error("unused"); }
  async findUserByEmail(): Promise<AuthUserWithPassword | null> { return null; }
  async verifyEmail(): Promise<AuthUser | null> { return null; }
  async createRefreshToken() {}
  async rotateRefreshToken(): Promise<AuthUser | null> { return null; }
  async revokeRefreshToken() {}
}

type Item = { id: string; position: number; sourceText: string; referenceAnswer: string | null };
type Answer = { id: string; translationItemId: string; answerText: string; isCorrect: boolean | null; teacherComment: string | null };
type Submission = { id: string; essayContent: string | null; wordCount: number | null; submittedAt: string | null; essayScore: number | null; teacherFeedback: string | null; gradedAt: string | null; translationAnswers: Answer[] };

class MemoryWriting extends WritingRepository {
  task: (WritingTaskInput & { id: string; assignmentId: string; maxScore: number; translationItems: Item[] }) | null = null;
  submission: Submission | null = null;
  inProgress = true;
  audits: string[] = [];
  constructor(readonly owner: string, readonly assignment: string, readonly student: string, readonly attempt: string) { super(); }
  private allowedTeacher(teacherId: string, assignmentId: string) { return teacherId === this.owner && assignmentId === this.assignment; }
  private taskView(includeReferences = true) {
    if (!this.task) return null;
    return { ...this.task, translationItems: this.task.translationItems.map((item) => includeReferences ? item : { id: item.id, position: item.position, sourceText: item.sourceText }) };
  }
  private progress() {
    if (!this.task || this.task.type === WritingTaskType.ESSAY) return null;
    const gradedCount = this.submission?.translationAnswers.filter((item) => item.isCorrect !== null).length ?? 0;
    const correctCount = this.submission?.translationAnswers.filter((item) => item.isCorrect === true).length ?? 0;
    const totalItems = this.task.translationItems.length;
    return { gradedCount, correctCount, totalItems, complete: totalItems > 0 && gradedCount === totalItems, percentage: gradedCount === totalItems && totalItems ? correctCount / totalItems * 100 : null };
  }
  private submissionView() { return this.submission ? { ...this.submission, translationResult: this.progress() } : null; }
  async upsertTask(teacherId: string, assignmentId: string, input: WritingTaskInput): Promise<WritingResult> {
    if (!this.allowedTeacher(teacherId, assignmentId)) return { status: "NOT_FOUND" };
    this.task = { ...input, id: this.task?.id ?? randomUUID(), assignmentId, maxScore: 10, translationItems: input.type === WritingTaskType.ESSAY ? [] : this.task?.translationItems ?? [] };
    this.audits.push(this.audits.length ? "WRITING_TASK_UPDATED" : "WRITING_TASK_CREATED");
    return { status: "OK", value: this.taskView() };
  }
  async deleteTask(teacherId: string, assignmentId: string): Promise<WritingResult> { if (!this.allowedTeacher(teacherId, assignmentId) || !this.task) return { status: "NOT_FOUND" }; this.task = null; return { status: "OK", value: { success: true } }; }
  async addTranslationItem(teacherId: string, assignmentId: string, input: TranslationItemInput): Promise<WritingResult> { if (!this.allowedTeacher(teacherId, assignmentId) || !this.task) return { status: "NOT_FOUND" }; if (this.task.type === WritingTaskType.ESSAY) return { status: "INVALID_STATE" }; const item = { id: randomUUID(), position: this.task.translationItems.length, sourceText: input.sourceText, referenceAnswer: input.referenceAnswer ?? null }; this.task.translationItems.push(item); return { status: "OK", value: item }; }
  async updateTranslationItem(teacherId: string, assignmentId: string, itemId: string, input: TranslationItemInput): Promise<WritingResult> { const item = this.task?.translationItems.find((value) => value.id === itemId); if (!this.allowedTeacher(teacherId, assignmentId) || !item) return { status: "NOT_FOUND" }; Object.assign(item, input); return { status: "OK", value: item }; }
  async deleteTranslationItem(teacherId: string, assignmentId: string, itemId: string): Promise<WritingResult> { if (!this.allowedTeacher(teacherId, assignmentId) || !this.task) return { status: "NOT_FOUND" }; const before = this.task.translationItems.length; this.task.translationItems = this.task.translationItems.filter((item) => item.id !== itemId); return before === this.task.translationItems.length ? { status: "NOT_FOUND" } : { status: "OK", value: { success: true } }; }
  async reorderTranslationItems(teacherId: string, assignmentId: string, ids: string[]): Promise<WritingResult> { if (!this.allowedTeacher(teacherId, assignmentId) || !this.task) return { status: "NOT_FOUND" }; if (ids.length !== this.task.translationItems.length || ids.some((id) => !this.task!.translationItems.some((item) => item.id === id))) return { status: "INVALID" }; this.task.translationItems = ids.map((id, position) => ({ ...this.task!.translationItems.find((item) => item.id === id)!, position })); return { status: "OK", value: { success: true } }; }
  async studentTask(studentId: string, assignmentId: string): Promise<WritingResult> { return studentId === this.student && assignmentId === this.assignment && this.task ? { status: "OK", value: this.taskView(false) } : { status: "NOT_FOUND" }; }
  async studentAttempt(studentId: string, attemptId: string): Promise<WritingResult> { return studentId === this.student && attemptId === this.attempt && this.task ? { status: "OK", value: { task: this.taskView(false), submission: this.submissionView(), editable: this.inProgress } } : { status: "NOT_FOUND" }; }
  async saveEssay(studentId: string, attemptId: string, content: string): Promise<WritingResult> { if (studentId !== this.student || attemptId !== this.attempt || !this.task) return { status: "NOT_FOUND" }; if (!this.inProgress) return { status: "INVALID_STATE" }; if (this.task.type !== WritingTaskType.ESSAY) return { status: "INVALID_STATE" }; const wordCount = countWritingWords(content); if (this.task.maxWords != null && wordCount > this.task.maxWords) return { status: "INVALID", message: `Bài viết vượt quá giới hạn ${this.task.maxWords} từ.` }; this.submission = { id: this.submission?.id ?? randomUUID(), essayContent: content, wordCount, submittedAt: null, essayScore: null, teacherFeedback: null, gradedAt: null, translationAnswers: [] }; return { status: "OK", value: this.submissionView() }; }
  async saveTranslation(studentId: string, attemptId: string, itemId: string, answerText: string): Promise<WritingResult> { if (studentId !== this.student || attemptId !== this.attempt || !this.task) return { status: "NOT_FOUND" }; if (!this.inProgress) return { status: "INVALID_STATE" }; if (this.task.type === WritingTaskType.ESSAY || !this.task.translationItems.some((item) => item.id === itemId)) return { status: "INVALID_STATE" }; this.submission ??= { id: randomUUID(), essayContent: null, wordCount: null, submittedAt: null, essayScore: null, teacherFeedback: null, gradedAt: null, translationAnswers: [] }; const existing = this.submission.translationAnswers.find((item) => item.translationItemId === itemId); if (existing) Object.assign(existing, { answerText, isCorrect: null, teacherComment: null }); else this.submission.translationAnswers.push({ id: randomUUID(), translationItemId: itemId, answerText, isCorrect: null, teacherComment: null }); return { status: "OK", value: this.submission.translationAnswers.find((item) => item.translationItemId === itemId)! }; }
  async gradeEssay(teacherId: string, assignmentId: string, submissionId: string, score: number, feedback?: string | null): Promise<WritingResult> { if (!this.allowedTeacher(teacherId, assignmentId) || this.submission?.id !== submissionId || !this.submission.submittedAt) return { status: "NOT_FOUND" }; if (score < 0 || score > 10) return { status: "INVALID" }; Object.assign(this.submission, { essayScore: score, teacherFeedback: feedback ?? null, gradedAt: new Date().toISOString() }); this.audits.push("ESSAY_GRADED"); return { status: "OK", value: this.submissionView() }; }
  async gradeTranslation(teacherId: string, assignmentId: string, submissionId: string, answerId: string, isCorrect: boolean, teacherComment?: string | null): Promise<WritingResult> { const answer = this.submission?.translationAnswers.find((item) => item.id === answerId); if (!this.allowedTeacher(teacherId, assignmentId) || this.submission?.id !== submissionId || !this.submission.submittedAt || !answer) return { status: "NOT_FOUND" }; Object.assign(answer, { isCorrect, teacherComment: teacherComment ?? null }); if (this.progress()?.complete) { this.submission.gradedAt = new Date().toISOString(); this.audits.push("TRANSLATION_GRADED"); } return { status: "OK", value: this.submissionView() }; }
  async saveFeedback(teacherId: string, assignmentId: string, submissionId: string, feedback?: string | null): Promise<WritingResult> { if (!this.allowedTeacher(teacherId, assignmentId) || this.submission?.id !== submissionId || !this.submission.submittedAt) return { status: "NOT_FOUND" }; this.submission.teacherFeedback = feedback ?? null; return { status: "OK", value: this.submissionView() }; }
}

describe("Assignment Writing API", () => {
  let app: INestApplication; let server: Parameters<typeof request>[0]; let jwt: JwtService; let repository: MemoryWriting;
  const owner = randomUUID(), other = randomUUID(), pending = randomUUID(), student = randomUUID(), outsider = randomUUID(), assignment = randomUUID(), attempt = randomUUID();
  const users: AuthUser[] = [
    { id: owner, email: "owner@writing.test", phone: null, fullName: "Owner", status: "ACTIVE", roles: [Role.TEACHER] },
    { id: other, email: "other@writing.test", phone: null, fullName: "Other", status: "ACTIVE", roles: [Role.TEACHER] },
    { id: pending, email: "pending@writing.test", phone: null, fullName: "Pending", status: "ACTIVE", roles: [Role.TEACHER] },
    { id: student, email: "student@writing.test", phone: null, fullName: "Student", status: "ACTIVE", roles: [Role.STUDENT] },
    { id: outsider, email: "outsider@writing.test", phone: null, fullName: "Outsider", status: "ACTIVE", roles: [Role.STUDENT] },
  ];
  before(async () => { repository = new MemoryWriting(owner, assignment, student, attempt); const moduleRef = await Test.createTestingModule({ imports: [JwtModule.register({ secret: authConfig.accessSecret() })], controllers: [WritingController], providers: [WritingService, JwtAuthGuard, RolesGuard, { provide: TeacherApprovalRepository, useValue: { isApproved: async (id: string) => id !== pending } }, { provide: AuthRepository, useValue: new TestAuth(users) }, { provide: WritingRepository, useValue: repository }] }).compile(); app = moduleRef.createNestApplication(); await app.init(); server = app.getHttpServer(); jwt = moduleRef.get(JwtService); });
  after(async () => { await app.close(); });
  async function auth(id: string) { const user = users.find((item) => item.id === id)!; return `Bearer ${await jwt.signAsync({ sub: user.id, email: user.email, roles: user.roles }, { secret: authConfig.accessSecret(), issuer: authConfig.accessIssuer(), audience: authConfig.accessAudience(), expiresIn: 900 })}`; }

  test("Writing is optional and teacher access requires an approved assignment owner", async () => { await request(server).get(`/student/assignments/${assignment}/writing`).set("Authorization", await auth(student)).expect(404); const essay = { type: "ESSAY", title: "My school", prompt: "Write about your school.", minWords: 2, maxWords: 5 }; await request(server).put(`/assignments/${assignment}/writing`).set("Authorization", await auth(pending)).send(essay).expect(403); await request(server).put(`/assignments/${assignment}/writing`).set("Authorization", await auth(other)).send(essay).expect(404); await request(server).put(`/assignments/${assignment}/writing`).set("Authorization", await auth(owner)).send({ ...essay, prompt: "" }).expect(400); await request(server).put(`/assignments/${assignment}/writing`).set("Authorization", await auth(owner)).send({ type: "TRANSLATION_EN_VI", title: "Dịch Anh sang Việt" }).expect(200).expect(({ body }) => assert.equal(body.type, "TRANSLATION_EN_VI")); await request(server).put(`/assignments/${assignment}/writing`).set("Authorization", await auth(owner)).send(essay).expect(200).expect(({ body }) => assert.equal(body.maxScore, 10)); assert.ok(repository.audits.includes("WRITING_TASK_CREATED")); });
  test("student access is enrollment-scoped and essay autosave replaces content with deterministic word count", async () => { await request(server).get(`/student/assignments/${assignment}/writing`).set("Authorization", await auth(outsider)).expect(404); await request(server).get(`/student/assignments/${assignment}/writing`).set("Authorization", await auth(student)).expect(200); await request(server).put(`/student/assignment-attempts/${attempt}/writing/essay`).set("Authorization", await auth(student)).send({ content: "Xin chào  Việt Nam" }).expect(200).expect(({ body }) => { assert.equal(body.wordCount, 4); assert.equal(body.essayContent, "Xin chào  Việt Nam"); }); await request(server).put(`/student/assignment-attempts/${attempt}/writing/essay`).set("Authorization", await auth(student)).send({ content: "one two three four five six" }).expect(400); await request(server).put(`/student/assignment-attempts/${attempt}/writing/essay`).set("Authorization", await auth(student)).send({ content: "New saved essay" }).expect(200).expect(({ body }) => assert.equal(body.essayContent, "New saved essay")); });
  test("submitted essay is immutable and supports 0, 10 and decimal manual scores", async () => { repository.inProgress = false; repository.submission!.submittedAt = new Date().toISOString(); await request(server).put(`/student/assignment-attempts/${attempt}/writing/essay`).set("Authorization", await auth(student)).send({ content: "Cannot change" }).expect(409); for (const score of [-1, 10.01]) await request(server).patch(`/assignments/${assignment}/writing/submissions/${repository.submission!.id}/essay-grade`).set("Authorization", await auth(owner)).send({ score }).expect(400); await request(server).patch(`/assignments/${assignment}/writing/submissions/${repository.submission!.id}/essay-grade`).set("Authorization", await auth(other)).send({ score: 8 }).expect(404); for (const score of [0, 8.5, 10]) await request(server).patch(`/assignments/${assignment}/writing/submissions/${repository.submission!.id}/essay-grade`).set("Authorization", await auth(owner)).send({ score, feedback: "Tốt" }).expect(200).expect(({ body }) => assert.equal(body.essayScore, score)); assert.ok(repository.audits.includes("ESSAY_GRADED")); });
  test("translation items preserve order, hide reference answers from students, autosave and grade per sentence", async () => { repository.inProgress = true; repository.submission = null; await request(server).put(`/assignments/${assignment}/writing`).set("Authorization", await auth(owner)).send({ type: "TRANSLATION_VI_EN", title: "Translate" }).expect(200); const first = await request(server).post(`/assignments/${assignment}/writing/translation-items`).set("Authorization", await auth(owner)).send({ sourceText: "Tôi đi học.", referenceAnswer: "I go to school." }).expect(201); const second = await request(server).post(`/assignments/${assignment}/writing/translation-items`).set("Authorization", await auth(owner)).send({ sourceText: "Trời đẹp.", referenceAnswer: "The weather is nice." }).expect(201); await request(server).post(`/assignments/${assignment}/writing/translation-items/reorder`).set("Authorization", await auth(owner)).send({ ids: [second.body.id, first.body.id] }).expect(201); const task = await request(server).get(`/student/assignments/${assignment}/writing`).set("Authorization", await auth(student)).expect(200); assert.deepEqual(task.body.translationItems.map((item: Item) => item.id), [second.body.id, first.body.id]); assert.equal(JSON.stringify(task.body).includes("referenceAnswer"), false); const answerOne = await request(server).put(`/student/assignment-attempts/${attempt}/writing/translation/${second.body.id}`).set("Authorization", await auth(student)).send({ answerText: "The weather is nice." }).expect(200); const answerTwo = await request(server).put(`/student/assignment-attempts/${attempt}/writing/translation/${first.body.id}`).set("Authorization", await auth(student)).send({ answerText: "I school." }).expect(200); repository.inProgress = false; repository.submission!.submittedAt = new Date().toISOString(); await request(server).patch(`/assignments/${assignment}/writing/submissions/${repository.submission!.id}/translation/${answerOne.body.id}`).set("Authorization", await auth(owner)).send({ isCorrect: true, teacherComment: "Đúng" }).expect(200).expect(({ body }) => assert.equal(body.translationResult.complete, false)); await request(server).patch(`/assignments/${assignment}/writing/submissions/${repository.submission!.id}/translation/${answerTwo.body.id}`).set("Authorization", await auth(owner)).send({ isCorrect: false, teacherComment: "Thiếu động từ" }).expect(200).expect(({ body }) => { assert.equal(body.translationResult.complete, true); assert.equal(body.translationResult.percentage, 50); }); await request(server).patch(`/assignments/${assignment}/writing/submissions/${repository.submission!.id}/feedback`).set("Authorization", await auth(owner)).send({ feedback: "Cần chú ý cấu trúc câu." }).expect(200).expect(({ body }) => assert.equal(body.teacherFeedback, "Cần chú ý cấu trúc câu.")); assert.ok(repository.audits.includes("TRANSLATION_GRADED")); });
});

test("Writing helpers keep word counting and combined manual-grade state deterministic", () => {
  assert.equal(countWritingWords("  Một   bài\nviết tốt  "), 4);
  assert.equal(manualGradeComplete({ hasReadAloud: false, readAloudScore: null, writingType: WritingTaskType.ESSAY, essayScore: 0, translationItemCount: 0, translationGrades: [] }), true);
  assert.equal(manualGradeComplete({ hasReadAloud: true, readAloudScore: null, writingType: WritingTaskType.TRANSLATION_VI_EN, essayScore: null, translationItemCount: 2, translationGrades: [true, false] }), false);
  assert.equal(manualGradeComplete({ hasReadAloud: true, readAloudScore: 8.5, writingType: WritingTaskType.TRANSLATION_VI_EN, essayScore: null, translationItemCount: 2, translationGrades: [true, false] }), true);
});
