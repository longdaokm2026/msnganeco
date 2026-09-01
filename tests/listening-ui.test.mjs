import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("teacher and student Assignment screens place Listening before Writing and Speaking", async () => {
  const [teacher, student] = await Promise.all([
    read("../app/TeacherAssignmentManager.tsx"),
    read("../app/StudentAssignmentManager.tsx"),
  ]);
  assert.match(teacher, /TeacherListeningEditor/);
  assert.ok(teacher.lastIndexOf("TeacherListeningEditor") < teacher.lastIndexOf("TeacherWritingEditor"));
  assert.ok(teacher.lastIndexOf("TeacherWritingEditor") < teacher.lastIndexOf("read-aloud-editor"));
  assert.match(student, /StudentListeningSection/);
  assert.ok(student.lastIndexOf("StudentListeningSection") < student.lastIndexOf("StudentWritingSection"));
  assert.ok(student.lastIndexOf("StudentWritingSection") < student.lastIndexOf("speaking-part"));
});

test("student Listening obtains audio through an authenticated play endpoint and shows server counts", async () => {
  const studentListening = await read("../app/StudentListeningSection.tsx");
  assert.match(studentListening, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(studentListening, /X-Listening-Play-Count/);
  assert.match(studentListening, /assignment-attempts\/\$\{attemptId\}\/listening-tracks\/\$\{track.id\}\/play/);
  assert.match(studentListening, /Đã hết lượt nghe/);
  assert.doesNotMatch(studentListening, /storageKey|ASSIGNMENT_UPLOAD_DIR/);
});
