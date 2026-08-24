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
      "attendance_records",
      "audit_logs",
      "class_enrollments",
      "class_sessions",
      "classrooms",
      "guardian_profiles",
      "refresh_tokens",
      "student_guardians",
      "student_profiles",
      "teacher_profiles",
      "user_roles",
      "users",
      "verification_tokens",
    ]);
  } finally {
    await db.close();
  }
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
