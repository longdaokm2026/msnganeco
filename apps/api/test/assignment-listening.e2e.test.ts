import "dotenv/config";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import request from "supertest";
import { ListeningTranscriptVisibility } from "../../../generated/prisma/client";
import { ApprovedTeacherGuard, TeacherApprovalRepository } from "../src/access/teacher-approval-access";
import { RolesGuard } from "../src/access/roles.guard";
import { AssignmentAudioStorageService } from "../src/assignments/assignment-audio-storage.service";
import { ListeningController } from "../src/assignments/listening.controller";
import {
  ListeningRepository,
  type ListeningAudioInput,
  type ListeningAudioRecord,
  type ListeningResult,
  type ListeningTrackInput,
} from "../src/assignments/listening.repository";
import { ListeningService } from "../src/assignments/listening.service";
import { ReadAloudStorageService } from "../src/assignments/read-aloud-storage.service";
import { AuthRepository } from "../src/auth/auth.repository";
import type { AuthUser, AuthUserWithPassword } from "../src/auth/auth.types";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard";
import { authConfig } from "../src/config/env";

class TestAuth extends AuthRepository {
  constructor(private readonly users: AuthUser[]) {
    super();
  }
  async findUserById(id: string) {
    return this.users.find((item) => item.id === id) ?? null;
  }
  async createUser(): Promise<AuthUser> {
    throw new Error("unused");
  }
  async findUserByEmail(): Promise<AuthUserWithPassword | null> {
    return null;
  }
  async verifyEmail(): Promise<AuthUser | null> {
    return null;
  }
  async createRefreshToken() {}
  async rotateRefreshToken(): Promise<AuthUser | null> {
    return null;
  }
  async revokeRefreshToken() {}
}

type Track = ListeningTrackInput & {
  id: string;
  assignmentId: string;
  position: number;
  audio: ListeningAudioInput | null;
};

class MemoryListeningRepository extends ListeningRepository {
  track: Track | null = null;
  playCount = 0;
  inProgress = true;
  audits: string[] = [];

  constructor(
    private readonly ownerId: string,
    private readonly assignmentId: string,
    private readonly studentId: string,
    private readonly attemptId: string,
  ) {
    super();
  }

  private owns(teacherId: string, assignmentId: string) {
    return teacherId === this.ownerId && assignmentId === this.assignmentId;
  }

  async createTrack(teacherId: string, assignmentId: string, input: ListeningTrackInput): Promise<ListeningResult> {
    if (!this.owns(teacherId, assignmentId)) return { status: "NOT_FOUND" };
    this.track = { ...input, id: randomUUID(), assignmentId, position: 0, audio: null };
    this.audits.push("ASSIGNMENT_LISTENING_TRACK_CREATED");
    return { status: "OK", value: { ...this.track, audioAttachment: null, questionCount: 0 } };
  }

  async updateTrack(teacherId: string, assignmentId: string, trackId: string, input: ListeningTrackInput): Promise<ListeningResult> {
    if (!this.owns(teacherId, assignmentId) || this.track?.id !== trackId) return { status: "NOT_FOUND" };
    this.track = { ...this.track, ...input };
    return { status: "OK", value: this.track };
  }

  async deleteTrack(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningResult<{ success: true; oldStorageKey: string | null }>> {
    if (!this.owns(teacherId, assignmentId) || this.track?.id !== trackId) return { status: "NOT_FOUND" };
    const oldStorageKey = this.track.audio?.storageKey ?? null;
    this.track = null;
    return { status: "OK", value: { success: true, oldStorageKey } };
  }

  async reorderTracks(teacherId: string, assignmentId: string, ids: string[]): Promise<ListeningResult> {
    if (!this.owns(teacherId, assignmentId) || ids.length !== 1 || ids[0] !== this.track?.id) return { status: "INVALID" };
    return { status: "OK", value: { success: true } };
  }

  async saveAudio(teacherId: string, assignmentId: string, trackId: string, input: ListeningAudioInput): Promise<ListeningResult<{ track: unknown; oldStorageKey: string | null }>> {
    if (!this.owns(teacherId, assignmentId) || this.track?.id !== trackId) return { status: "NOT_FOUND" };
    const oldStorageKey = this.track.audio?.storageKey ?? null;
    this.track.audio = input;
    this.audits.push("ASSIGNMENT_LISTENING_AUDIO_UPLOADED");
    return { status: "OK", value: { track: { ...this.track, audio: undefined, audioReady: true }, oldStorageKey } };
  }

  async removeAudio(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningResult<{ success: true; oldStorageKey: string | null }>> {
    if (!this.owns(teacherId, assignmentId) || this.track?.id !== trackId) return { status: "NOT_FOUND" };
    const oldStorageKey = this.track.audio?.storageKey ?? null;
    this.track.audio = null;
    return { status: "OK", value: { success: true, oldStorageKey } };
  }

  async teacherAudio(teacherId: string, assignmentId: string, trackId: string): Promise<ListeningAudioRecord | null> {
    if (!this.owns(teacherId, assignmentId) || this.track?.id !== trackId || !this.track.audio) return null;
    return this.track.audio;
  }

  async play(studentId: string, attemptId: string, trackId: string): Promise<ListeningResult<ListeningAudioRecord>> {
    if (studentId !== this.studentId || attemptId !== this.attemptId || this.track?.id !== trackId || !this.track.audio) return { status: "NOT_FOUND" };
    if (this.inProgress) {
      if (this.track.maxPlayCount != null && this.playCount >= this.track.maxPlayCount) {
        return { status: "LIMIT", message: "Bạn đã sử dụng hết số lượt nghe." };
      }
      this.playCount += 1;
    }
    return { status: "OK", value: { ...this.track.audio, playCount: this.playCount, maxPlayCount: this.track.maxPlayCount ?? null } };
  }
}

describe("Assignment Listening API", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let jwt: JwtService;
  let repository: MemoryListeningRepository;
  let uploadDirectory = "";
  let trackId = "";
  const owner = randomUUID(), other = randomUUID(), pending = randomUUID(), student = randomUUID(), outsider = randomUUID(), assignment = randomUUID(), attempt = randomUUID();
  const users: AuthUser[] = [
    { id: owner, email: "owner@listening.test", phone: null, fullName: "Owner", status: "ACTIVE", roles: ["TEACHER"] },
    { id: other, email: "other@listening.test", phone: null, fullName: "Other", status: "ACTIVE", roles: ["TEACHER"] },
    { id: pending, email: "pending@listening.test", phone: null, fullName: "Pending", status: "ACTIVE", roles: ["TEACHER"] },
    { id: student, email: "student@listening.test", phone: null, fullName: "Student", status: "ACTIVE", roles: ["STUDENT"] },
    { id: outsider, email: "outsider@listening.test", phone: null, fullName: "Outsider", status: "ACTIVE", roles: ["STUDENT"] },
  ];

  before(async () => {
    uploadDirectory = await mkdtemp(join(tmpdir(), "msngan-listening-test-"));
    process.env.ASSIGNMENT_UPLOAD_DIR = uploadDirectory;
    repository = new MemoryListeningRepository(owner, assignment, student, attempt);
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig.accessSecret() })],
      controllers: [ListeningController],
      providers: [
        ListeningService,
        ReadAloudStorageService,
        { provide: AssignmentAudioStorageService, useExisting: ReadAloudStorageService },
        JwtAuthGuard,
        RolesGuard,
        ApprovedTeacherGuard,
        { provide: TeacherApprovalRepository, useValue: { isApproved: async (id: string) => id !== pending } },
        { provide: AuthRepository, useValue: new TestAuth(users) },
        { provide: ListeningRepository, useValue: repository },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    jwt = moduleRef.get(JwtService);
  });

  after(async () => {
    await app.close();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  async function auth(id: string) {
    const user = users.find((item) => item.id === id)!;
    return `Bearer ${await jwt.signAsync({ sub: user.id, email: user.email, roles: user.roles }, { secret: authConfig.accessSecret(), issuer: authConfig.accessIssuer(), audience: authConfig.accessAudience(), expiresIn: 900 })}`;
  }

  test("only an approved owner teacher creates a Listening track", async () => {
    const input = { title: "At the market", instructions: "Nghe và trả lời.", transcript: "I would like two apples.", transcriptVisibility: ListeningTranscriptVisibility.AFTER_SUBMIT, maxPlayCount: 2, allowSeeking: false };
    await request(server).post(`/assignments/${assignment}/listening-tracks`).set("Authorization", await auth(student)).send(input).expect(403);
    await request(server).post(`/assignments/${assignment}/listening-tracks`).set("Authorization", await auth(pending)).send(input).expect(403);
    await request(server).post(`/assignments/${assignment}/listening-tracks`).set("Authorization", await auth(other)).send(input).expect(404);
    const created = await request(server).post(`/assignments/${assignment}/listening-tracks`).set("Authorization", await auth(owner)).send(input).expect(201);
    trackId = created.body.id;
    assert.equal(created.body.maxPlayCount, 2);
    assert.ok(repository.audits.includes("ASSIGNMENT_LISTENING_TRACK_CREATED"));
  });

  test("teacher uploads and previews validated audio without exposing its storage key", async () => {
    const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
    const uploaded = await request(server).post(`/assignments/${assignment}/listening-tracks/${trackId}/audio`).set("Authorization", await auth(owner)).attach("file", mp3, { filename: "market.mp3", contentType: "audio/mpeg" }).expect(201);
    assert.equal(uploaded.body.storageKey, undefined);
    assert.match(repository.track?.audio?.storageKey ?? "", /^listening\//);
    assert.ok(repository.audits.includes("ASSIGNMENT_LISTENING_AUDIO_UPLOADED"));
    await request(server).get(`/assignments/${assignment}/listening-tracks/${trackId}/audio`).set("Authorization", await auth(owner)).expect(200).expect("Content-Type", /audio\/mpeg/);
    await request(server).get(`/assignments/${assignment}/listening-tracks/${trackId}/audio`).set("Authorization", await auth(other)).expect(404);
    await request(server).post(`/assignments/${assignment}/listening-tracks/${trackId}/audio`).set("Authorization", await auth(owner)).attach("file", Buffer.from("bad"), { filename: "bad.exe", contentType: "application/octet-stream" }).expect(400);
  });

  test("student play endpoint is authenticated and enforces the server-side play limit", async () => {
    await request(server).post(`/student/assignment-attempts/${attempt}/listening-tracks/${trackId}/play`).expect(401);
    await request(server).post(`/student/assignment-attempts/${attempt}/listening-tracks/${trackId}/play`).set("Authorization", await auth(outsider)).expect(404);
    await request(server).post(`/student/assignment-attempts/${attempt}/listening-tracks/${trackId}/play`).set("Authorization", await auth(student)).expect(201).expect("X-Listening-Play-Count", "1");
    await request(server).post(`/student/assignment-attempts/${attempt}/listening-tracks/${trackId}/play`).set("Authorization", await auth(student)).expect(201).expect("X-Listening-Play-Count", "2");
    await request(server).post(`/student/assignment-attempts/${attempt}/listening-tracks/${trackId}/play`).set("Authorization", await auth(student)).expect(409);
  });

  test("submitted attempt may review audio without consuming another play", async () => {
    repository.inProgress = false;
    await request(server).post(`/student/assignment-attempts/${attempt}/listening-tracks/${trackId}/play`).set("Authorization", await auth(student)).expect(201).expect("X-Listening-Play-Count", "2");
    assert.equal(repository.playCount, 2);
  });
});
