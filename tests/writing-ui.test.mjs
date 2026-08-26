import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("teacher and student Assignment screens expose Writing as a separate skill before Speaking", async () => {
  const [teacher, student] = await Promise.all([
    read("../app/TeacherAssignmentManager.tsx"),
    read("../app/StudentAssignmentManager.tsx"),
  ]);
  assert.match(teacher, /TeacherWritingEditor/);
  assert.match(teacher, /TeacherWritingGrading/);
  assert.ok(teacher.indexOf("TeacherWritingGrading") < teacher.lastIndexOf("read-aloud-grading"));
  assert.match(student, /StudentWritingSection/);
  assert.ok(student.lastIndexOf("StudentWritingSection") < student.lastIndexOf("speaking-part"));
  assert.match(student, /writingSaving/);
});

test("student sidebar uses the concise Phụ huynh label without changing its route", async () => {
  const [page, dashboard] = await Promise.all([
    read("../app/page.tsx"),
    read("../apps/api/src/dashboard/dashboard.service.ts"),
  ]);
  assert.match(page, /"Phụ huynh": "student-guardians"/);
  assert.doesNotMatch(page, /"Quản lý phụ huynh": "student-guardians"/);
  assert.match(dashboard, /actions: \["Chuyên cần", "Bài học", "Bài tập", "Phụ huynh"\]/);
});
