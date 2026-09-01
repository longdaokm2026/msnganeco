import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";

const migrationUrl = new URL(
  "../prisma/migrations/20260823010000_init_accounts/migration.sql",
  import.meta.url,
);
const refreshFamiliesMigrationUrl = new URL(
  "../prisma/migrations/20260823020000_refresh_token_families/migration.sql",
  import.meta.url,
);
const classroomsMigrationUrl = new URL(
  "../prisma/migrations/20260823030000_classrooms/migration.sql",
  import.meta.url,
);
const sessionsAttendanceMigrationUrl = new URL(
  "../prisma/migrations/20260823040000_sessions_attendance/migration.sql",
  import.meta.url,
);
const guardianLinksMigrationUrl = new URL(
  "../prisma/migrations/20260824010000_guardian_links/migration.sql",
  import.meta.url,
);
const adminManagementMigrationUrl = new URL(
  "../prisma/migrations/20260825010000_admin_management/migration.sql",
  import.meta.url,
);
const lessonManagementMigrationUrl = new URL(
  "../prisma/migrations/20260825020000_lesson_management/migration.sql",
  import.meta.url,
);
const assignmentCoreMigrationUrl = new URL(
  "../prisma/migrations/20260825030000_assignment_core/migration.sql",
  import.meta.url,
);
const assignmentReadAloudMigrationUrl = new URL(
  "../prisma/migrations/20260825040000_assignment_read_aloud/migration.sql",
  import.meta.url,
);
const quickQuizMigrationUrl = new URL(
  "../prisma/migrations/20260825050000_quick_vocabulary_quiz/migration.sql",
  import.meta.url,
);
const assignmentWritingMigrationUrl = new URL(
  "../prisma/migrations/20260826010000_assignment_writing/migration.sql",
  import.meta.url,
);
const assignmentListeningMigrationUrl = new URL(
  "../prisma/migrations/20260901010000_assignment_listening/migration.sql",
  import.meta.url,
);

async function createDatabase() {
  const db = await PGlite.create({ extensions: { citext } });
  const migration = await readFile(migrationUrl, "utf8");
  await db.exec(migration);
  const refreshFamiliesMigration = await readFile(refreshFamiliesMigrationUrl, "utf8");
  await db.exec(refreshFamiliesMigration);
  const classroomsMigration = await readFile(classroomsMigrationUrl, "utf8");
  await db.exec(classroomsMigration);
  const sessionsAttendanceMigration = await readFile(sessionsAttendanceMigrationUrl, "utf8");
  await db.exec(sessionsAttendanceMigration);
  const guardianLinksMigration = await readFile(guardianLinksMigrationUrl, "utf8");
  await db.exec(guardianLinksMigration);
  const adminManagementMigration = await readFile(adminManagementMigrationUrl, "utf8");
  await db.exec(adminManagementMigration);
  const lessonManagementMigration = await readFile(lessonManagementMigrationUrl, "utf8");
  await db.exec(lessonManagementMigration);
  const assignmentCoreMigration = await readFile(assignmentCoreMigrationUrl, "utf8");
  await db.exec(assignmentCoreMigration);
  const assignmentReadAloudMigration = await readFile(assignmentReadAloudMigrationUrl, "utf8");
  await db.exec(assignmentReadAloudMigration);
  const quickQuizMigration = await readFile(quickQuizMigrationUrl, "utf8");
  await db.exec(quickQuizMigration);
  const assignmentWritingMigration = await readFile(assignmentWritingMigrationUrl, "utf8");
  await db.exec(assignmentWritingMigration);
  const assignmentListeningMigration = await readFile(assignmentListeningMigrationUrl, "utf8");
  await db.exec(assignmentListeningMigration);
  return db;
}

test("initial migration creates the account tables", async () => {
  const db = await createDatabase();

  try {
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = result.rows.map(({ table_name }) => table_name);
    assert.deepEqual(tables, [
      "absence_requests",
      "assignment_answers",
      "assignment_attempts",
      "assignment_audio_attachments",
      "assignment_listening_playbacks",
      "assignment_listening_tracks",
      "assignment_passages",
      "assignment_questions",
      "assignment_read_aloud_submissions",
      "assignment_read_aloud_tasks",
      "assignment_writing_tasks",
      "assignments",
      "attendance_records",
      "audit_logs",
      "class_enrollments",
      "class_sessions",
      "classrooms",
      "guardian_profiles",
      "lesson_attachments",
      "lessons",
      "refresh_tokens",
      "student_guardians",
      "student_profiles",
      "teacher_profiles",
      "user_roles",
      "users",
      "verification_tokens",
      "writing_submissions",
      "writing_translation_answers",
      "writing_translation_items",
    ]);
  } finally {
    await db.close();
  }
});

test("assignment migration enforces ordering, attempts, answers and academic-history foreign keys", async () => {
  const db = await createDatabase();
  const teacherId = "12000000-0000-4000-8000-000000000001";
  const studentId = "12000000-0000-4000-8000-000000000002";
  const classroomId = "12000000-0000-4000-8000-000000000003";
  const assignmentId = "12000000-0000-4000-8000-000000000004";
  const questionId = "12000000-0000-4000-8000-000000000005";
  const attemptId = "12000000-0000-4000-8000-000000000006";
  try {
    await db.exec(`
      INSERT INTO users (id,email,password_hash,full_name,status,updated_at) VALUES ('${teacherId}','assignment-teacher@test.local','hash','Teacher','ACTIVE',NOW()),('${studentId}','assignment-student@test.local','hash','Student','ACTIVE',NOW());
      INSERT INTO teacher_profiles (user_id,approval_status,updated_at) VALUES ('${teacherId}','APPROVED',NOW());
      INSERT INTO student_profiles (user_id,updated_at) VALUES ('${studentId}',NOW());
      INSERT INTO classrooms (id,teacher_id,code,name,updated_at) VALUES ('${classroomId}','${teacherId}','MSN-ASGN','Assignment Class',NOW());
      INSERT INTO assignments (id,classroom_id,created_by_id,title,updated_at) VALUES ('${assignmentId}','${classroomId}','${teacherId}','Vocabulary',NOW());
      INSERT INTO assignment_questions (id,assignment_id,type,section,position,prompt,config,updated_at) VALUES ('${questionId}','${assignmentId}','VOCAB_FILL_BLANK','VOCABULARY',0,'Apple','{"acceptedAnswers":["apple"]}',NOW());
      INSERT INTO assignment_attempts (id,assignment_id,student_id,attempt_number,updated_at) VALUES ('${attemptId}','${assignmentId}','${studentId}',1,NOW());
      INSERT INTO assignment_answers (attempt_id,question_id,answer,updated_at) VALUES ('${attemptId}','${questionId}','{"text":"apple"}',NOW());
    `);
    await assert.rejects(db.query(`INSERT INTO assignment_questions (assignment_id,type,section,position,prompt,config,updated_at) VALUES ($1,'VOCAB_FILL_BLANK','VOCABULARY',0,'Duplicate','{}',NOW())`, [assignmentId]), /duplicate key value/i);
    await assert.rejects(db.query(`INSERT INTO assignment_attempts (assignment_id,student_id,attempt_number,updated_at) VALUES ($1,$2,1,NOW())`, [assignmentId, studentId]), /duplicate key value/i);
    await assert.rejects(db.query(`DELETE FROM assignments WHERE id=$1`, [assignmentId]), /foreign key constraint/i);
    const answer = await db.query(`SELECT count(*)::int AS count FROM assignment_answers WHERE attempt_id=$1`, [attemptId]);
    assert.equal(answer.rows[0].count, 1);
  } finally { await db.close(); }
});

test("read-aloud migration enforces one task and one secure audio submission per attempt", async () => {
  const db = await createDatabase();
  const teacherId = "13000000-0000-4000-8000-000000000001", studentId = "13000000-0000-4000-8000-000000000002", classroomId = "13000000-0000-4000-8000-000000000003", assignmentId = "13000000-0000-4000-8000-000000000004", attemptId = "13000000-0000-4000-8000-000000000005", taskId = "13000000-0000-4000-8000-000000000006", audioId = "13000000-0000-4000-8000-000000000007";
  try {
    await db.exec(`
      INSERT INTO users (id,email,password_hash,full_name,status,updated_at) VALUES ('${teacherId}','read-teacher@test.local','hash','Teacher','ACTIVE',NOW()),('${studentId}','read-student@test.local','hash','Student','ACTIVE',NOW());
      INSERT INTO teacher_profiles (user_id,approval_status,updated_at) VALUES ('${teacherId}','APPROVED',NOW());
      INSERT INTO student_profiles (user_id,updated_at) VALUES ('${studentId}',NOW());
      INSERT INTO classrooms (id,teacher_id,code,name,updated_at) VALUES ('${classroomId}','${teacherId}','MSN-READ','Read Aloud',NOW());
      INSERT INTO assignments (id,classroom_id,created_by_id,title,updated_at) VALUES ('${assignmentId}','${classroomId}','${teacherId}','Read',NOW());
      INSERT INTO assignment_attempts (id,assignment_id,student_id,attempt_number,status,max_score,updated_at) VALUES ('${attemptId}','${assignmentId}','${studentId}',1,'PENDING_MANUAL_GRADE',10,NOW());
      INSERT INTO assignment_read_aloud_tasks (id,assignment_id,reading_text,max_score,max_duration_seconds,updated_at) VALUES ('${taskId}','${assignmentId}','Hello',10,300,NOW());
      INSERT INTO assignment_audio_attachments (id,file_name,file_type,file_size,storage_key,uploaded_by_id) VALUES ('${audioId}','reading.webm','audio/webm',20,'secure-key.webm','${studentId}');
      INSERT INTO assignment_read_aloud_submissions (assignment_id,read_aloud_task_id,attempt_id,student_id,audio_attachment_id,duration_seconds,updated_at) VALUES ('${assignmentId}','${taskId}','${attemptId}','${studentId}','${audioId}',20,NOW());
    `);
    await assert.rejects(db.query(`INSERT INTO assignment_read_aloud_tasks (assignment_id,reading_text,max_score,max_duration_seconds,updated_at) VALUES ($1,'Again',10,300,NOW())`, [assignmentId]), /duplicate key value/i);
    await assert.rejects(db.query(`UPDATE assignment_read_aloud_tasks SET max_duration_seconds=301 WHERE id=$1`, [taskId]), /check constraint/i);
    await assert.rejects(db.query(`INSERT INTO assignment_read_aloud_submissions (assignment_id,read_aloud_task_id,attempt_id,student_id,audio_attachment_id,updated_at) VALUES ($1,$2,$3,$4,$5,NOW())`, [assignmentId, taskId, attemptId, studentId, audioId]), /duplicate key value/i);
  } finally { await db.close(); }
});

test("Writing migration is additive and enforces one task, ordered translation items and 0–10 Essay scores", async () => {
  const db = await createDatabase();
  const teacherId = "15000000-0000-4000-8000-000000000001", studentId = "15000000-0000-4000-8000-000000000002", classroomId = "15000000-0000-4000-8000-000000000003", assignmentId = "15000000-0000-4000-8000-000000000004", attemptId = "15000000-0000-4000-8000-000000000005", taskId = "15000000-0000-4000-8000-000000000006", itemId = "15000000-0000-4000-8000-000000000007", submissionId = "15000000-0000-4000-8000-000000000008";
  try {
    await db.exec(`
      INSERT INTO users (id,email,password_hash,full_name,status,updated_at) VALUES ('${teacherId}','writing-teacher@test.local','hash','Teacher','ACTIVE',NOW()),('${studentId}','writing-student@test.local','hash','Student','ACTIVE',NOW());
      INSERT INTO teacher_profiles (user_id,approval_status,updated_at) VALUES ('${teacherId}','APPROVED',NOW());
      INSERT INTO student_profiles (user_id,updated_at) VALUES ('${studentId}',NOW());
      INSERT INTO classrooms (id,teacher_id,code,name,updated_at) VALUES ('${classroomId}','${teacherId}','MSN-WRITE','Writing Class',NOW());
      INSERT INTO assignments (id,classroom_id,created_by_id,title,updated_at) VALUES ('${assignmentId}','${classroomId}','${teacherId}','Writing',NOW());
      INSERT INTO assignment_attempts (id,assignment_id,student_id,attempt_number,status,max_score,updated_at) VALUES ('${attemptId}','${assignmentId}','${studentId}',1,'PENDING_MANUAL_GRADE',0,NOW());
      INSERT INTO assignment_writing_tasks (id,assignment_id,type,title,max_score,updated_at) VALUES ('${taskId}','${assignmentId}','TRANSLATION_VI_EN','Dịch câu',10,NOW());
      INSERT INTO writing_translation_items (id,writing_task_id,position,source_text,reference_answer,updated_at) VALUES ('${itemId}','${taskId}',0,'Tôi đi học.','I go to school.',NOW());
      INSERT INTO writing_submissions (id,writing_task_id,attempt_id,student_id,submitted_at,updated_at) VALUES ('${submissionId}','${taskId}','${attemptId}','${studentId}',NOW(),NOW());
      INSERT INTO writing_translation_answers (writing_submission_id,translation_item_id,answer_text,updated_at) VALUES ('${submissionId}','${itemId}','I go to school.',NOW());
    `);
    await assert.rejects(db.query(`INSERT INTO assignment_writing_tasks (assignment_id,type,prompt,max_score,updated_at) VALUES ($1,'ESSAY','Essay',10,NOW())`, [assignmentId]), /duplicate key value/i);
    await assert.rejects(db.query(`INSERT INTO writing_translation_items (writing_task_id,position,source_text,updated_at) VALUES ($1,0,'Duplicate',NOW())`, [taskId]), /duplicate key value/i);
    await assert.rejects(db.query(`UPDATE assignment_writing_tasks SET max_score=20 WHERE id=$1`, [taskId]), /check constraint/i);
    await assert.rejects(db.query(`UPDATE writing_submissions SET essay_score=10.01 WHERE id=$1`, [submissionId]), /check constraint/i);
    await db.query(`DELETE FROM assignment_attempts WHERE id=$1`, [attemptId]);
    const remaining = await db.query(`SELECT count(*)::int AS count FROM writing_submissions WHERE attempt_id=$1`, [attemptId]);
    assert.equal(remaining.rows[0].count, 0);
  } finally { await db.close(); }
});

test("Listening migration keeps audio outside PostgreSQL and enforces track, question and playback integrity", async () => {
  const db = await createDatabase();
  const teacherId = "16000000-0000-4000-8000-000000000001", studentId = "16000000-0000-4000-8000-000000000002", classroomId = "16000000-0000-4000-8000-000000000003", assignmentId = "16000000-0000-4000-8000-000000000004", attemptId = "16000000-0000-4000-8000-000000000005", trackId = "16000000-0000-4000-8000-000000000006", audioId = "16000000-0000-4000-8000-000000000007", passageId = "16000000-0000-4000-8000-000000000008";
  try {
    await db.exec(`
      INSERT INTO users (id,email,password_hash,full_name,status,updated_at) VALUES ('${teacherId}','listening-teacher@test.local','hash','Teacher','ACTIVE',NOW()),('${studentId}','listening-student@test.local','hash','Student','ACTIVE',NOW());
      INSERT INTO teacher_profiles (user_id,approval_status,updated_at) VALUES ('${teacherId}','APPROVED',NOW());
      INSERT INTO student_profiles (user_id,updated_at) VALUES ('${studentId}',NOW());
      INSERT INTO classrooms (id,teacher_id,code,name,updated_at) VALUES ('${classroomId}','${teacherId}','MSN-LISTEN','Listening Class',NOW());
      INSERT INTO assignments (id,classroom_id,created_by_id,title,updated_at) VALUES ('${assignmentId}','${classroomId}','${teacherId}','Listening',NOW());
      INSERT INTO assignment_attempts (id,assignment_id,student_id,attempt_number,status,updated_at) VALUES ('${attemptId}','${assignmentId}','${studentId}',1,'IN_PROGRESS',NOW());
      INSERT INTO assignment_listening_tracks (id,assignment_id,title,max_play_count,position,updated_at) VALUES ('${trackId}','${assignmentId}','Track 1',2,0,NOW());
      INSERT INTO assignment_audio_attachments (id,listening_track_id,file_name,file_type,file_size,storage_key,uploaded_by_id) VALUES ('${audioId}','${trackId}','track.mp3','audio/mpeg',20,'listening/secure-key.mp3','${teacherId}');
      INSERT INTO assignment_questions (assignment_id,listening_track_id,type,section,position,prompt,config,updated_at) VALUES ('${assignmentId}','${trackId}','LISTENING_MULTIPLE_CHOICE','LISTENING',0,'What did you hear?','{"options":[{"id":"a","text":"Hello"}],"correctOptionId":"a"}',NOW());
      INSERT INTO assignment_listening_playbacks (track_id,attempt_id,student_id) VALUES ('${trackId}','${attemptId}','${studentId}');
      INSERT INTO assignment_passages (id,assignment_id,position,title,content,updated_at) VALUES ('${passageId}','${assignmentId}',0,'Reading','Text',NOW());
    `);
    await assert.rejects(db.query(`INSERT INTO assignment_listening_tracks (assignment_id,title,position,updated_at) VALUES ($1,'Duplicate position',0,NOW())`, [assignmentId]), /duplicate key value/i);
    await assert.rejects(db.query(`UPDATE assignment_listening_tracks SET max_play_count=0 WHERE id=$1`, [trackId]), /check constraint/i);
    await assert.rejects(db.query(`INSERT INTO assignment_questions (assignment_id,passage_id,listening_track_id,type,section,position,prompt,config,updated_at) VALUES ($1,$2,$3,'LISTENING_FILL_BLANK','LISTENING',1,'Both contexts','{}',NOW())`, [assignmentId, passageId, trackId]), /check constraint/i);
    const audio = await db.query(`SELECT storage_key, listening_track_id FROM assignment_audio_attachments WHERE id=$1`, [audioId]);
    assert.deepEqual(audio.rows[0], { storage_key: "listening/secure-key.mp3", listening_track_id: trackId });
    await db.query(`DELETE FROM assignment_attempts WHERE id=$1`, [attemptId]);
    const playbacks = await db.query(`SELECT count(*)::int AS count FROM assignment_listening_playbacks WHERE attempt_id=$1`, [attemptId]);
    assert.equal(playbacks.rows[0].count, 0);
  } finally { await db.close(); }
});

test("quick quiz migration is additive and applies safe defaults to existing assignments", async () => {
  const db = await PGlite.create({ extensions: { citext } });
  const teacherId = "14000000-0000-4000-8000-000000000001";
  const classroomId = "14000000-0000-4000-8000-000000000002";
  const assignmentId = "14000000-0000-4000-8000-000000000003";
  try {
    for (const url of [migrationUrl, refreshFamiliesMigrationUrl, classroomsMigrationUrl, sessionsAttendanceMigrationUrl, guardianLinksMigrationUrl, adminManagementMigrationUrl, lessonManagementMigrationUrl, assignmentCoreMigrationUrl, assignmentReadAloudMigrationUrl]) await db.exec(await readFile(url, "utf8"));
    await db.exec(`
      INSERT INTO users (id,email,password_hash,full_name,status,updated_at) VALUES ('${teacherId}','quiz-teacher@test.local','hash','Teacher','ACTIVE',NOW());
      INSERT INTO teacher_profiles (user_id,approval_status,updated_at) VALUES ('${teacherId}','APPROVED',NOW());
      INSERT INTO classrooms (id,teacher_id,code,name,updated_at) VALUES ('${classroomId}','${teacherId}','MSN-QUIZ','Quiz Class',NOW());
      INSERT INTO assignments (id,classroom_id,created_by_id,title,updated_at) VALUES ('${assignmentId}','${classroomId}','${teacherId}','Existing assignment',NOW());
    `);
    await db.exec(await readFile(quickQuizMigrationUrl, "utf8"));
    const row = await db.query(`SELECT generation_mode, generation_model, source_lesson_ids, show_leaderboard FROM assignments WHERE id=$1`, [assignmentId]);
    assert.deepEqual(row.rows[0], { generation_mode: "MANUAL", generation_model: null, source_lesson_ids: [], show_leaderboard: true });
  } finally { await db.close(); }
});

test("lesson migration preserves historical sessions and enforces one lesson per session", async () => {
  const db = await PGlite.create({ extensions: { citext } });
  const teacherId = "11000000-0000-4000-8000-000000000001";
  const classroomId = "11000000-0000-4000-8000-000000000002";
  const sessionId = "11000000-0000-4000-8000-000000000003";
  try {
    for (const url of [migrationUrl, refreshFamiliesMigrationUrl, classroomsMigrationUrl, sessionsAttendanceMigrationUrl, guardianLinksMigrationUrl, adminManagementMigrationUrl]) await db.exec(await readFile(url, "utf8"));
    await db.exec(`INSERT INTO users (id,email,password_hash,full_name,status,updated_at) VALUES ('${teacherId}','lesson-teacher@test.local','hash','Teacher','ACTIVE',NOW()); INSERT INTO teacher_profiles (user_id,approval_status,updated_at) VALUES ('${teacherId}','APPROVED',NOW()); INSERT INTO classrooms (id,teacher_id,code,name,updated_at) VALUES ('${classroomId}','${teacherId}','MSN-LESSON','Lesson Class',NOW()); INSERT INTO class_sessions (id,classroom_id,title,scheduled_start,scheduled_end,updated_at) VALUES ('${sessionId}','${classroomId}','Historical',NOW(),NOW()+INTERVAL '1 hour',NOW());`);
    await db.exec(await readFile(lessonManagementMigrationUrl, "utf8"));
    const history = await db.query(`SELECT count(*)::int AS count FROM class_sessions WHERE id=$1`, [sessionId]); assert.equal(history.rows[0].count, 1);
    const lessonId = "11000000-0000-4000-8000-000000000004";
    await db.query(`INSERT INTO lessons (id,session_id,title,created_by_id,updated_by_id,updated_at) VALUES ($1,$2,'Lesson',$3,$3,NOW())`, [lessonId, sessionId, teacherId]);
    await db.query(`INSERT INTO lesson_attachments (id,lesson_id,file_name,file_type,file_size,storage_key,uploaded_by_id) VALUES ($1,$2,'Worksheet.pdf','application/pdf',12,'test-storage-key',$3)`, ["11000000-0000-4000-8000-000000000006", lessonId, teacherId]);
    await assert.rejects(db.query(`INSERT INTO lessons (id,session_id,title,created_by_id,updated_by_id,updated_at) VALUES ($1,$2,'Duplicate',$3,$3,NOW())`, ["11000000-0000-4000-8000-000000000005", sessionId, teacherId]), /duplicate key value/i);
    await db.query(`DELETE FROM class_sessions WHERE id=$1`, [sessionId]);
    const lessons = await db.query(`SELECT count(*)::int AS count FROM lessons WHERE session_id=$1`, [sessionId]); assert.equal(lessons.rows[0].count, 0);
    const attachments = await db.query(`SELECT count(*)::int AS count FROM lesson_attachments WHERE lesson_id=$1`, [lessonId]); assert.equal(attachments.rows[0].count, 0);
  } finally { await db.close(); }
});

test("admin migration backfills teachers and adds review metadata", async () => {
  const db = await PGlite.create({ extensions: { citext } });
  try {
    for (const url of [migrationUrl, refreshFamiliesMigrationUrl, classroomsMigrationUrl, sessionsAttendanceMigrationUrl, guardianLinksMigrationUrl]) {
      await db.exec(await readFile(url, "utf8"));
    }
    const teacherId = "e0000000-0000-4000-8000-000000000001";
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, updated_at)
       VALUES ($1, 'legacy-teacher@test.local', 'hash', 'Legacy Teacher', NOW())`,
      [teacherId],
    );
    await db.query(`INSERT INTO teacher_profiles (user_id, updated_at) VALUES ($1, NOW())`, [teacherId]);
    await db.exec(await readFile(adminManagementMigrationUrl, "utf8"));

    const profile = await db.query(
      `SELECT approval_status, approved_at, approved_by_id, rejected_at, rejection_note
       FROM teacher_profiles WHERE user_id = $1`,
      [teacherId],
    );
    assert.equal(profile.rows[0].approval_status, "APPROVED");
    assert.ok(profile.rows[0].approved_at);

    await db.query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [teacherId]);
    const user = await db.query(`SELECT status FROM users WHERE id = $1`, [teacherId]);
    assert.equal(user.rows[0].status, "DISABLED");
  } finally {
    await db.close();
  }
});

test("password reset tokens are hashed-token records and cascade with users", async () => {
  const db = await createDatabase();
  const userId = "f0000000-0000-4000-8000-000000000001";
  const tokenId = "f0000000-0000-4000-8000-000000000002";
  try {
    await db.query(`INSERT INTO users (id, email, password_hash, full_name, status, updated_at) VALUES ($1, 'reset@test.local', 'hash', 'Reset User', 'ACTIVE', NOW())`, [userId]);
    await db.query(`INSERT INTO verification_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ($1, $2, 'PASSWORD_RESET', $3, NOW() + INTERVAL '30 minutes')`, [tokenId, userId, "a".repeat(64)]);
    await assert.rejects(db.query(`INSERT INTO verification_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ($1, $2, 'PASSWORD_RESET', $3, NOW())`, ["f0000000-0000-4000-8000-000000000003", userId, "a".repeat(64)]), /duplicate key value/i);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    const remaining = await db.query(`SELECT count(*)::int AS count FROM verification_tokens WHERE user_id = $1`, [userId]);
    assert.equal(remaining.rows[0].count, 0);
  } finally { await db.close(); }
});

test("sessions and absence review states are enforced by the database", async () => {
  const db = await createDatabase();
  const teacherId = "70000000-0000-4000-8000-000000000001";
  const studentId = "80000000-0000-4000-8000-000000000001";
  const classroomId = "90000000-0000-4000-8000-000000000001";
  const sessionId = "a0000000-0000-4000-8000-000000000001";

  try {
    await db.exec(`
      INSERT INTO users (id, email, password_hash, full_name, updated_at) VALUES
        ('${teacherId}', 'teacher@sessions.test', 'hash', 'Teacher', NOW()),
        ('${studentId}', 'student@sessions.test', 'hash', 'Student', NOW());
      INSERT INTO teacher_profiles (user_id, updated_at) VALUES ('${teacherId}', NOW());
      INSERT INTO student_profiles (user_id, updated_at) VALUES ('${studentId}', NOW());
      INSERT INTO classrooms (id, teacher_id, code, name, updated_at)
      VALUES ('${classroomId}', '${teacherId}', 'MSN-SESS01', 'Session Test', NOW());
      INSERT INTO class_enrollments (classroom_id, student_id, updated_at)
      VALUES ('${classroomId}', '${studentId}', NOW());
      INSERT INTO class_sessions
        (id, classroom_id, title, scheduled_start, scheduled_end, updated_at)
      VALUES
        ('${sessionId}', '${classroomId}', 'Lesson 1', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW());
    `);

    await assert.rejects(
      db.query(
        `INSERT INTO class_sessions
          (id, classroom_id, title, scheduled_start, scheduled_end, updated_at)
         VALUES ($1, $2, 'Invalid time', NOW() + INTERVAL '3 days', NOW() + INTERVAL '2 days', NOW())`,
        ["a0000000-0000-4000-8000-000000000002", classroomId],
      ),
      /check constraint/i,
    );

    await assert.rejects(
      db.query(
        `INSERT INTO absence_requests
          (id, session_id, student_id, reason, status, updated_at)
         VALUES ($1, $2, $3, 'Sick', 'APPROVED', NOW())`,
        ["b0000000-0000-4000-8000-000000000001", sessionId, studentId],
      ),
      /check constraint/i,
    );
  } finally {
    await db.close();
  }
});

test("classroom capacity and enrollment state are enforced by the database", async () => {
  const db = await createDatabase();
  const teacherId = "40000000-0000-4000-8000-000000000001";
  const studentId = "50000000-0000-4000-8000-000000000001";
  const classroomId = "60000000-0000-4000-8000-000000000001";

  try {
    await db.exec(`
      INSERT INTO users (id, email, password_hash, full_name, updated_at) VALUES
        ('${teacherId}', 'teacher@class.test', 'hash', 'Teacher', NOW()),
        ('${studentId}', 'student@class.test', 'hash', 'Student', NOW());
      INSERT INTO teacher_profiles (user_id, updated_at) VALUES ('${teacherId}', NOW());
      INSERT INTO student_profiles (user_id, updated_at) VALUES ('${studentId}', NOW());
      INSERT INTO classrooms
        (id, teacher_id, code, name, max_students, updated_at)
      VALUES ('${classroomId}', '${teacherId}', 'MSN-TEST01', 'Foundation', 20, NOW());
      INSERT INTO class_enrollments
        (classroom_id, student_id, updated_at)
      VALUES ('${classroomId}', '${studentId}', NOW());
    `);

    await assert.rejects(
      db.query(
        `INSERT INTO classrooms
          (id, teacher_id, code, name, max_students, updated_at)
         VALUES ($1, $2, $3, $4, 0, NOW())`,
        ["60000000-0000-4000-8000-000000000002", teacherId, "MSN-BAD001", "Invalid"],
      ),
      /check constraint/i,
    );

    await assert.rejects(
      db.query(
        `UPDATE class_enrollments
         SET status = 'REMOVED', removed_at = NULL, updated_at = NOW()
         WHERE classroom_id = $1 AND student_id = $2`,
        [classroomId, studentId],
      ),
      /check constraint/i,
    );
  } finally {
    await db.close();
  }
});

test("email uniqueness is case-insensitive", async () => {
  const db = await createDatabase();

  try {
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, updated_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      ["10000000-0000-4000-8000-000000000001", "Student@Example.com", "hash", "Student"],
    );

    await assert.rejects(
      db.query(
        `INSERT INTO users (id, email, password_hash, full_name, updated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ["10000000-0000-4000-8000-000000000002", "student@example.com", "hash", "Duplicate"],
      ),
      /duplicate key value/i,
    );
  } finally {
    await db.close();
  }
});

test("a student can have only one primary guardian", async () => {
  const db = await createDatabase();
  const studentId = "20000000-0000-4000-8000-000000000001";
  const guardianOneId = "30000000-0000-4000-8000-000000000001";
  const guardianTwoId = "30000000-0000-4000-8000-000000000002";

  try {
    await db.exec(`
      INSERT INTO users (id, email, password_hash, full_name, updated_at) VALUES
        ('${studentId}', 'student@test.local', 'hash', 'Student', NOW()),
        ('${guardianOneId}', 'guardian1@test.local', 'hash', 'Guardian One', NOW()),
        ('${guardianTwoId}', 'guardian2@test.local', 'hash', 'Guardian Two', NOW());
      INSERT INTO student_profiles (user_id, updated_at) VALUES ('${studentId}', NOW());
      INSERT INTO guardian_profiles (user_id, updated_at) VALUES
        ('${guardianOneId}', NOW()),
        ('${guardianTwoId}', NOW());
      INSERT INTO student_guardians
        (student_id, guardian_id, relationship, status, is_primary_contact, responded_at)
      VALUES ('${studentId}', '${guardianOneId}', 'MOTHER', 'ACTIVE', true, NOW());
    `);

    await assert.rejects(
      db.query(
        `INSERT INTO student_guardians
          (student_id, guardian_id, relationship, status, is_primary_contact, responded_at)
         VALUES ($1, $2, $3, 'ACTIVE', true, NOW())`,
        [studentId, guardianTwoId, "FATHER"],
      ),
      /duplicate key value/i,
    );
  } finally {
    await db.close();
  }
});

test("guardian links require student approval before becoming active", async () => {
  const db = await createDatabase();
  const studentId = "c0000000-0000-4000-8000-000000000001";
  const guardianId = "d0000000-0000-4000-8000-000000000001";

  try {
    await db.exec(`
      INSERT INTO users (id, email, password_hash, full_name, updated_at) VALUES
        ('${studentId}', 'student@links.test', 'hash', 'Student', NOW()),
        ('${guardianId}', 'guardian@links.test', 'hash', 'Guardian', NOW());
      INSERT INTO student_profiles (user_id, updated_at) VALUES ('${studentId}', NOW());
      INSERT INTO guardian_profiles (user_id, updated_at) VALUES ('${guardianId}', NOW());
      INSERT INTO student_guardians (student_id, guardian_id, relationship)
      VALUES ('${studentId}', '${guardianId}', 'MOTHER');
    `);

    const pending = await db.query(
      `SELECT status, responded_at FROM student_guardians
       WHERE student_id = $1 AND guardian_id = $2`,
      [studentId, guardianId],
    );
    assert.deepEqual(pending.rows, [{ status: "PENDING", responded_at: null }]);

    await assert.rejects(
      db.query(
        `UPDATE student_guardians
         SET status = 'ACTIVE', is_primary_contact = true, responded_at = NULL, updated_at = NOW()
         WHERE student_id = $1 AND guardian_id = $2`,
        [studentId, guardianId],
      ),
      /check constraint/i,
    );

    await db.query(
      `UPDATE student_guardians
       SET status = 'ACTIVE', is_primary_contact = true, responded_at = NOW(), updated_at = NOW()
       WHERE student_id = $1 AND guardian_id = $2`,
      [studentId, guardianId],
    );
  } finally {
    await db.close();
  }
});

test("refresh tokens have an indexed session family", async () => {
  const db = await createDatabase();

  try {
    const columns = await db.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'refresh_tokens'
        AND column_name = 'family_id'
    `);
    assert.deepEqual(columns.rows, [{ column_name: "family_id", is_nullable: "NO" }]);

    const indexes = await db.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'refresh_tokens'
        AND indexname = 'refresh_tokens_family_id_idx'
    `);
    assert.equal(indexes.rows.length, 1);
  } finally {
    await db.close();
  }
});
