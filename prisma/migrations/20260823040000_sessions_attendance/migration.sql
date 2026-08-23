CREATE TYPE "ClassSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE "AbsenceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "topic" TEXT,
    "scheduled_start" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_end" TIMESTAMPTZ(3) NOT NULL,
    "status" "ClassSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "class_sessions_title_not_blank_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "class_sessions_time_range_check" CHECK ("scheduled_end" > "scheduled_start")
);

CREATE TABLE "attendance_records" (
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" VARCHAR(500),
    "marked_by_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("session_id", "student_id")
);

CREATE TABLE "absence_requests" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "AbsenceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "review_note" VARCHAR(500),
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "absence_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "absence_requests_reason_not_blank_check" CHECK (length(trim("reason")) > 0),
    CONSTRAINT "absence_requests_review_state_check" CHECK (
      ("status" = 'PENDING' AND "reviewed_by_id" IS NULL AND "reviewed_at" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewed_by_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
      OR ("status" = 'CANCELLED')
    )
);

CREATE UNIQUE INDEX "class_sessions_classroom_id_scheduled_start_key"
ON "class_sessions"("classroom_id", "scheduled_start");
CREATE INDEX "class_sessions_scheduled_start_status_idx"
ON "class_sessions"("scheduled_start", "status");
CREATE INDEX "attendance_records_student_id_status_idx"
ON "attendance_records"("student_id", "status");
CREATE UNIQUE INDEX "absence_requests_session_id_student_id_key"
ON "absence_requests"("session_id", "student_id");
CREATE INDEX "absence_requests_student_id_status_idx"
ON "absence_requests"("student_id", "status");
CREATE INDEX "absence_requests_session_id_status_idx"
ON "absence_requests"("session_id", "status");

ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_classroom_id_fkey"
FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_id_fkey"
FOREIGN KEY ("marked_by_id") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_reviewed_by_id_fkey"
FOREIGN KEY ("reviewed_by_id") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
