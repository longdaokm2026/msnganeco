CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "LessonAttachmentCategory" AS ENUM ('IMAGE', 'DOCUMENT', 'WORKSHEET', 'READING', 'SLIDE', 'OTHER');

CREATE TABLE "lessons" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "title" VARCHAR(200) NOT NULL,
  "summary" TEXT,
  "main_content" TEXT,
  "theory" TEXT,
  "vocabulary" TEXT,
  "grammar" TEXT,
  "examples" TEXT,
  "review_notes" TEXT,
  "homework_notes" TEXT,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  CONSTRAINT "lessons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lessons_title_not_blank_check" CHECK (length(trim("title")) > 0)
);

CREATE TABLE "lesson_attachments" (
  "id" UUID NOT NULL,
  "lesson_id" UUID NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "file_type" VARCHAR(150) NOT NULL,
  "file_size" INTEGER NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "category" "LessonAttachmentCategory" NOT NULL DEFAULT 'OTHER',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" UUID NOT NULL,
  CONSTRAINT "lesson_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lesson_attachments_file_size_check" CHECK ("file_size" > 0 AND "file_size" <= 10485760)
);

CREATE UNIQUE INDEX "lessons_session_id_key" ON "lessons"("session_id");
CREATE INDEX "lessons_status_updated_at_idx" ON "lessons"("status", "updated_at");
CREATE UNIQUE INDEX "lesson_attachments_storage_key_key" ON "lesson_attachments"("storage_key");
CREATE INDEX "lesson_attachments_lesson_id_idx" ON "lesson_attachments"("lesson_id");

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
