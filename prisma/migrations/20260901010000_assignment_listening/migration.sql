ALTER TYPE "AssignmentSection" ADD VALUE 'LISTENING';
ALTER TYPE "AssignmentQuestionType" ADD VALUE 'LISTENING_MULTIPLE_CHOICE';
ALTER TYPE "AssignmentQuestionType" ADD VALUE 'LISTENING_TRUE_FALSE';
ALTER TYPE "AssignmentQuestionType" ADD VALUE 'LISTENING_FILL_BLANK';
ALTER TYPE "AssignmentQuestionType" ADD VALUE 'LISTENING_MATCHING';
CREATE TYPE "ListeningTranscriptVisibility" AS ENUM ('NEVER', 'AFTER_SUBMIT');

CREATE TABLE "assignment_listening_tracks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "instructions" TEXT,
  "transcript" TEXT,
  "transcript_visibility" "ListeningTranscriptVisibility" NOT NULL DEFAULT 'NEVER',
  "max_play_count" INTEGER,
  "allow_seeking" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_listening_tracks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_listening_tracks_title_nonblank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "assignment_listening_tracks_position_nonnegative" CHECK ("position" >= 0),
  CONSTRAINT "assignment_listening_tracks_max_play_count_positive" CHECK ("max_play_count" IS NULL OR "max_play_count" >= 1)
);

ALTER TABLE "assignment_audio_attachments" ADD COLUMN "listening_track_id" UUID;
ALTER TABLE "assignment_questions" ADD COLUMN "listening_track_id" UUID;
ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_single_context" CHECK (NOT ("passage_id" IS NOT NULL AND "listening_track_id" IS NOT NULL));

CREATE TABLE "assignment_listening_playbacks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "track_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "played_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_listening_playbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assignment_listening_tracks_assignment_id_position_key" ON "assignment_listening_tracks"("assignment_id", "position");
CREATE INDEX "assignment_listening_tracks_assignment_id_position_idx" ON "assignment_listening_tracks"("assignment_id", "position");
CREATE UNIQUE INDEX "assignment_audio_attachments_listening_track_id_key" ON "assignment_audio_attachments"("listening_track_id");
CREATE INDEX "assignment_questions_listening_track_id_idx" ON "assignment_questions"("listening_track_id");
CREATE INDEX "assignment_listening_playbacks_attempt_id_track_id_idx" ON "assignment_listening_playbacks"("attempt_id", "track_id");
CREATE INDEX "assignment_listening_playbacks_student_id_played_at_idx" ON "assignment_listening_playbacks"("student_id", "played_at");

ALTER TABLE "assignment_listening_tracks" ADD CONSTRAINT "assignment_listening_tracks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_audio_attachments" ADD CONSTRAINT "assignment_audio_attachments_listening_track_id_fkey" FOREIGN KEY ("listening_track_id") REFERENCES "assignment_listening_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_listening_track_id_fkey" FOREIGN KEY ("listening_track_id") REFERENCES "assignment_listening_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_listening_playbacks" ADD CONSTRAINT "assignment_listening_playbacks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "assignment_listening_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_listening_playbacks" ADD CONSTRAINT "assignment_listening_playbacks_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assignment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_listening_playbacks" ADD CONSTRAINT "assignment_listening_playbacks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
