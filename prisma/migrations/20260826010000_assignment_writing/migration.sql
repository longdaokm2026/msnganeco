CREATE TYPE "WritingTaskType" AS ENUM ('ESSAY', 'TRANSLATION_VI_EN', 'TRANSLATION_EN_VI');

CREATE TABLE "assignment_writing_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "type" "WritingTaskType" NOT NULL,
  "title" VARCHAR(200),
  "prompt" TEXT,
  "instructions" TEXT,
  "min_words" INTEGER,
  "max_words" INTEGER,
  "max_score" DECIMAL(8,2) NOT NULL DEFAULT 10,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_writing_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_writing_tasks_word_limits" CHECK (
    ("min_words" IS NULL OR "min_words" >= 0) AND
    ("max_words" IS NULL OR "max_words" >= 0) AND
    ("min_words" IS NULL OR "max_words" IS NULL OR "max_words" >= "min_words")
  ),
  CONSTRAINT "assignment_writing_tasks_score" CHECK ("max_score" = 10),
  CONSTRAINT "assignment_writing_tasks_essay_prompt" CHECK (
    "type" <> 'ESSAY' OR ("prompt" IS NOT NULL AND length(btrim("prompt")) > 0)
  )
);

CREATE TABLE "writing_translation_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "writing_task_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "source_text" TEXT NOT NULL,
  "reference_answer" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "writing_translation_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "writing_translation_items_source_nonblank" CHECK (length(btrim("source_text")) > 0)
);

CREATE TABLE "writing_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "writing_task_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "essay_content" TEXT,
  "word_count" INTEGER,
  "submitted_at" TIMESTAMPTZ(3),
  "essay_score" DECIMAL(8,2),
  "teacher_feedback" TEXT,
  "graded_by_id" UUID,
  "graded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "writing_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "writing_submissions_word_count" CHECK ("word_count" IS NULL OR "word_count" >= 0),
  CONSTRAINT "writing_submissions_essay_score" CHECK ("essay_score" IS NULL OR ("essay_score" >= 0 AND "essay_score" <= 10))
);

CREATE TABLE "writing_translation_answers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "writing_submission_id" UUID NOT NULL,
  "translation_item_id" UUID NOT NULL,
  "answer_text" TEXT NOT NULL,
  "is_correct" BOOLEAN,
  "teacher_comment" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "writing_translation_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assignment_writing_tasks_assignment_id_key" ON "assignment_writing_tasks"("assignment_id");
CREATE UNIQUE INDEX "writing_translation_items_task_position_key" ON "writing_translation_items"("writing_task_id", "position");
CREATE INDEX "writing_translation_items_task_position_idx" ON "writing_translation_items"("writing_task_id", "position");
CREATE UNIQUE INDEX "writing_submissions_attempt_id_key" ON "writing_submissions"("attempt_id");
CREATE UNIQUE INDEX "writing_submissions_task_attempt_key" ON "writing_submissions"("writing_task_id", "attempt_id");
CREATE INDEX "writing_submissions_task_idx" ON "writing_submissions"("writing_task_id");
CREATE INDEX "writing_submissions_student_idx" ON "writing_submissions"("student_id");
CREATE INDEX "writing_submissions_grader_idx" ON "writing_submissions"("graded_by_id");
CREATE UNIQUE INDEX "writing_translation_answers_submission_item_key" ON "writing_translation_answers"("writing_submission_id", "translation_item_id");
CREATE INDEX "writing_translation_answers_submission_idx" ON "writing_translation_answers"("writing_submission_id");
CREATE INDEX "writing_translation_answers_item_idx" ON "writing_translation_answers"("translation_item_id");

ALTER TABLE "assignment_writing_tasks" ADD CONSTRAINT "assignment_writing_tasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "writing_translation_items" ADD CONSTRAINT "writing_translation_items_task_id_fkey" FOREIGN KEY ("writing_task_id") REFERENCES "assignment_writing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_task_id_fkey" FOREIGN KEY ("writing_task_id") REFERENCES "assignment_writing_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assignment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "writing_translation_answers" ADD CONSTRAINT "writing_translation_answers_submission_id_fkey" FOREIGN KEY ("writing_submission_id") REFERENCES "writing_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "writing_translation_answers" ADD CONSTRAINT "writing_translation_answers_item_id_fkey" FOREIGN KEY ("translation_item_id") REFERENCES "writing_translation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
