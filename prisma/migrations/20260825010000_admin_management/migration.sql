-- Add the explicit account state used by the admin console.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

-- Existing teachers predate the approval workflow and remain operational.
UPDATE "teacher_profiles"
SET
  "approval_status" = 'APPROVED',
  "approved_at" = COALESCE("approved_at", "created_at")
WHERE "approval_status" <> 'APPROVED';

ALTER TABLE "teacher_profiles"
  ADD COLUMN "approved_by_id" UUID,
  ADD COLUMN "rejected_at" TIMESTAMPTZ(3),
  ADD COLUMN "rejection_note" VARCHAR(500);

CREATE INDEX "teacher_profiles_approved_by_id_idx"
ON "teacher_profiles"("approved_by_id");

ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_approved_by_id_fkey"
FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
