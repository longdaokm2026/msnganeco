-- CreateEnum
CREATE TYPE "ClassroomStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "classrooms" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "level" VARCHAR(60),
    "schedule_note" VARCHAR(160),
    "max_students" INTEGER NOT NULL DEFAULT 30,
    "status" "ClassroomStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "classrooms_name_not_blank_check" CHECK (length(trim("name")) > 0),
    CONSTRAINT "classrooms_max_students_check" CHECK ("max_students" BETWEEN 1 AND 200)
);

-- CreateTable
CREATE TABLE "class_enrollments" (
    "classroom_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("classroom_id", "student_id"),
    CONSTRAINT "class_enrollments_removed_state_check" CHECK (
      ("status" = 'ACTIVE' AND "removed_at" IS NULL)
      OR ("status" = 'REMOVED' AND "removed_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");
CREATE INDEX "classrooms_teacher_id_status_idx" ON "classrooms"("teacher_id", "status");
CREATE INDEX "classrooms_name_idx" ON "classrooms"("name");
CREATE INDEX "class_enrollments_student_id_status_idx" ON "class_enrollments"("student_id", "status");
CREATE INDEX "class_enrollments_classroom_id_status_idx" ON "class_enrollments"("classroom_id", "status");

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_id_fkey"
FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_classroom_id_fkey"
FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
