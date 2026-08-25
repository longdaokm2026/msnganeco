CREATE TYPE "AssignmentGenerationMode" AS ENUM ('MANUAL', 'AI', 'LOCAL');

ALTER TABLE "assignments"
  ADD COLUMN "show_leaderboard" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "generation_mode" "AssignmentGenerationMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "generation_model" VARCHAR(100),
  ADD COLUMN "source_lesson_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE INDEX "assignments_generation_mode_idx" ON "assignments"("generation_mode");
