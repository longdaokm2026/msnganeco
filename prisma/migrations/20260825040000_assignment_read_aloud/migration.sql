ALTER TYPE "AssignmentAttemptStatus" ADD VALUE 'PENDING_MANUAL_GRADE';
ALTER TYPE "AssignmentAttemptStatus" ADD VALUE 'FULLY_GRADED';

CREATE TABLE "assignment_read_aloud_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "title" VARCHAR(200),
  "reading_text" TEXT NOT NULL,
  "instructions" TEXT,
  "max_score" DECIMAL(8,2) NOT NULL DEFAULT 10,
  "max_duration_seconds" INTEGER DEFAULT 300,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_read_aloud_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_read_aloud_tasks_reading_text_nonblank" CHECK (length(btrim("reading_text")) > 0),
  CONSTRAINT "assignment_read_aloud_tasks_max_score_positive" CHECK ("max_score" > 0),
  CONSTRAINT "assignment_read_aloud_tasks_duration_range" CHECK ("max_duration_seconds" IS NULL OR ("max_duration_seconds" >= 1 AND "max_duration_seconds" <= 300))
);

CREATE TABLE "assignment_audio_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "file_name" VARCHAR(255) NOT NULL,
  "file_type" VARCHAR(100) NOT NULL,
  "file_size" INTEGER NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "uploaded_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_audio_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_audio_attachments_file_size_positive" CHECK ("file_size" > 0)
);

CREATE TABLE "assignment_read_aloud_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "read_aloud_task_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "audio_attachment_id" UUID NOT NULL,
  "duration_seconds" INTEGER,
  "submitted_at" TIMESTAMPTZ(3),
  "score" DECIMAL(8,2),
  "feedback" TEXT,
  "graded_by_id" UUID,
  "graded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_read_aloud_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_read_aloud_submissions_duration_positive" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
  CONSTRAINT "assignment_read_aloud_submissions_score_nonnegative" CHECK ("score" IS NULL OR "score" >= 0)
);

CREATE UNIQUE INDEX "assignment_read_aloud_tasks_assignment_id_key" ON "assignment_read_aloud_tasks"("assignment_id");
CREATE UNIQUE INDEX "assignment_audio_attachments_storage_key_key" ON "assignment_audio_attachments"("storage_key");
CREATE INDEX "assignment_audio_attachments_uploaded_by_id_idx" ON "assignment_audio_attachments"("uploaded_by_id");
CREATE UNIQUE INDEX "assignment_read_aloud_submissions_attempt_id_key" ON "assignment_read_aloud_submissions"("attempt_id");
CREATE UNIQUE INDEX "assignment_read_aloud_submissions_audio_attachment_id_key" ON "assignment_read_aloud_submissions"("audio_attachment_id");
CREATE INDEX "assignment_read_aloud_submissions_assignment_id_student_id_idx" ON "assignment_read_aloud_submissions"("assignment_id", "student_id");
CREATE INDEX "assignment_read_aloud_submissions_read_aloud_task_id_idx" ON "assignment_read_aloud_submissions"("read_aloud_task_id");
CREATE INDEX "assignment_read_aloud_submissions_graded_by_id_idx" ON "assignment_read_aloud_submissions"("graded_by_id");

ALTER TABLE "assignment_read_aloud_tasks" ADD CONSTRAINT "assignment_read_aloud_tasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_audio_attachments" ADD CONSTRAINT "assignment_audio_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_read_aloud_submissions" ADD CONSTRAINT "assignment_read_aloud_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_read_aloud_submissions" ADD CONSTRAINT "assignment_read_aloud_submissions_read_aloud_task_id_fkey" FOREIGN KEY ("read_aloud_task_id") REFERENCES "assignment_read_aloud_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_read_aloud_submissions" ADD CONSTRAINT "assignment_read_aloud_submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assignment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_read_aloud_submissions" ADD CONSTRAINT "assignment_read_aloud_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_read_aloud_submissions" ADD CONSTRAINT "assignment_read_aloud_submissions_audio_attachment_id_fkey" FOREIGN KEY ("audio_attachment_id") REFERENCES "assignment_audio_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_read_aloud_submissions" ADD CONSTRAINT "assignment_read_aloud_submissions_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
