CREATE TYPE "AssignmentType" AS ENUM ('PRACTICE', 'HOMEWORK', 'QUIZ', 'TEST');
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "AssignmentSection" AS ENUM ('VOCABULARY', 'GRAMMAR', 'READING');
CREATE TYPE "AssignmentQuestionType" AS ENUM ('VOCAB_MULTIPLE_CHOICE', 'VOCAB_MATCHING', 'VOCAB_FILL_BLANK', 'GRAMMAR_MULTIPLE_CHOICE', 'GRAMMAR_FILL_BLANK', 'GRAMMAR_SENTENCE_ORDER', 'GRAMMAR_ERROR_CORRECTION', 'READING_MULTIPLE_CHOICE', 'READING_TRUE_FALSE_NOT_GIVEN', 'READING_SHORT_ANSWER');
CREATE TYPE "AssignmentAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_GRADED');

CREATE TABLE "assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "classroom_id" UUID NOT NULL,
  "lesson_id" UUID,
  "created_by_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "type" "AssignmentType" NOT NULL DEFAULT 'HOMEWORK',
  "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
  "due_at" TIMESTAMPTZ(3),
  "allow_late_submission" BOOLEAN NOT NULL DEFAULT false,
  "max_attempts" INTEGER NOT NULL DEFAULT 1,
  "time_limit_minutes" INTEGER,
  "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
  "shuffle_options" BOOLEAN NOT NULL DEFAULT false,
  "show_score_immediately" BOOLEAN NOT NULL DEFAULT true,
  "show_answers_after_submit" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMPTZ(3),
  "closed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignments_title_nonblank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "assignments_max_attempts_positive" CHECK ("max_attempts" >= 1),
  CONSTRAINT "assignments_time_limit_positive" CHECK ("time_limit_minutes" IS NULL OR "time_limit_minutes" > 0)
);

CREATE TABLE "assignment_passages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "title" VARCHAR(200),
  "content" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_passages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_passages_content_nonblank" CHECK (length(btrim("content")) > 0),
  CONSTRAINT "assignment_passages_position_nonnegative" CHECK ("position" >= 0)
);

CREATE TABLE "assignment_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "passage_id" UUID,
  "type" "AssignmentQuestionType" NOT NULL,
  "section" "AssignmentSection" NOT NULL,
  "position" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "explanation" TEXT,
  "points" DECIMAL(8,2) NOT NULL DEFAULT 1,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_questions_prompt_nonblank" CHECK (length(btrim("prompt")) > 0),
  CONSTRAINT "assignment_questions_points_positive" CHECK ("points" > 0),
  CONSTRAINT "assignment_questions_position_nonnegative" CHECK ("position" >= 0)
);

CREATE TABLE "assignment_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "AssignmentAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMPTZ(3),
  "score" DECIMAL(10,2),
  "max_score" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "percentage" DECIMAL(6,2),
  "is_late" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_attempts_number_positive" CHECK ("attempt_number" >= 1),
  CONSTRAINT "assignment_attempts_score_nonnegative" CHECK ("score" IS NULL OR "score" >= 0),
  CONSTRAINT "assignment_attempts_max_score_nonnegative" CHECK ("max_score" >= 0),
  CONSTRAINT "assignment_attempts_percentage_range" CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100))
);

CREATE TABLE "assignment_answers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attempt_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "answer" JSONB NOT NULL,
  "normalized" JSONB,
  "is_correct" BOOLEAN,
  "awarded_points" DECIMAL(8,2),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_answers_points_nonnegative" CHECK ("awarded_points" IS NULL OR "awarded_points" >= 0)
);

CREATE INDEX "assignments_classroom_id_idx" ON "assignments"("classroom_id");
CREATE INDEX "assignments_lesson_id_idx" ON "assignments"("lesson_id");
CREATE INDEX "assignments_status_idx" ON "assignments"("status");
CREATE INDEX "assignments_due_at_idx" ON "assignments"("due_at");
CREATE UNIQUE INDEX "assignment_passages_assignment_id_position_key" ON "assignment_passages"("assignment_id", "position");
CREATE INDEX "assignment_passages_assignment_id_position_idx" ON "assignment_passages"("assignment_id", "position");
CREATE UNIQUE INDEX "assignment_questions_assignment_id_position_key" ON "assignment_questions"("assignment_id", "position");
CREATE INDEX "assignment_questions_assignment_id_position_idx" ON "assignment_questions"("assignment_id", "position");
CREATE INDEX "assignment_questions_passage_id_idx" ON "assignment_questions"("passage_id");
CREATE UNIQUE INDEX "assignment_attempts_assignment_id_student_id_attempt_number_key" ON "assignment_attempts"("assignment_id", "student_id", "attempt_number");
CREATE INDEX "assignment_attempts_assignment_id_student_id_idx" ON "assignment_attempts"("assignment_id", "student_id");
CREATE INDEX "assignment_attempts_student_id_status_idx" ON "assignment_attempts"("student_id", "status");
CREATE UNIQUE INDEX "assignment_answers_attempt_id_question_id_key" ON "assignment_answers"("attempt_id", "question_id");
CREATE INDEX "assignment_answers_attempt_id_idx" ON "assignment_answers"("attempt_id");

ALTER TABLE "assignments" ADD CONSTRAINT "assignments_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_passages" ADD CONSTRAINT "assignment_passages_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "assignment_passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignment_attempts" ADD CONSTRAINT "assignment_attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_attempts" ADD CONSTRAINT "assignment_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_answers" ADD CONSTRAINT "assignment_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assignment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_answers" ADD CONSTRAINT "assignment_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "assignment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
