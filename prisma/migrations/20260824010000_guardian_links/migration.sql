CREATE TYPE "GuardianLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');

ALTER TABLE "student_guardians"
ADD COLUMN "status" "GuardianLinkStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "responded_at" TIMESTAMPTZ(3),
ADD COLUMN "revoked_at" TIMESTAMPTZ(3),
ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rows created before Step 2C are trusted existing links.
UPDATE "student_guardians"
SET "responded_at" = "created_at",
    "requested_at" = "created_at";

ALTER TABLE "student_guardians"
ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "student_guardians"
ADD CONSTRAINT "student_guardians_relationship_not_blank_check"
CHECK (length(trim("relationship")) > 0),
ADD CONSTRAINT "student_guardians_state_check" CHECK (
  ("status" = 'PENDING' AND "responded_at" IS NULL AND "revoked_at" IS NULL)
  OR ("status" IN ('ACTIVE', 'REJECTED') AND "responded_at" IS NOT NULL AND "revoked_at" IS NULL)
  OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
),
ADD CONSTRAINT "student_guardians_primary_active_check"
CHECK (NOT "is_primary_contact" OR "status" = 'ACTIVE');

DROP INDEX "student_guardians_guardian_id_idx";
DROP INDEX "student_guardians_one_primary_contact_idx";

CREATE INDEX "student_guardians_guardian_id_status_idx"
ON "student_guardians"("guardian_id", "status");
CREATE INDEX "student_guardians_student_id_status_idx"
ON "student_guardians"("student_id", "status");

CREATE UNIQUE INDEX "student_guardians_one_primary_contact_idx"
ON "student_guardians"("student_id")
WHERE "is_primary_contact" = true AND "status" = 'ACTIVE';
