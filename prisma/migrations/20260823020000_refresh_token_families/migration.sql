-- Group rotated refresh tokens so a replayed token can revoke only the
-- compromised session family without signing the user out on other devices.
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID;

-- Existing tokens start as independent families.
UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL;

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
