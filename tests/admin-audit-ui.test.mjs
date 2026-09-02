import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin audit log renders localized actions, entities and structured details", async () => {
  const [viewer, formatter] = await Promise.all([
    read("../app/admin/AdminAuditLogs.tsx"),
    read("../app/admin/audit-display.ts"),
  ]);
  assert.match(formatter, /ASSIGNMENT_LISTENING_AUDIO_UPLOADED: "Tải audio Listening"/);
  assert.match(formatter, /AssignmentListeningTrack: "Đoạn Listening"/);
  assert.match(formatter, /fileSize: "Dung lượng"/);
  assert.match(viewer, /auditDetails\(item\.metadata\)/);
  assert.doesNotMatch(viewer, /JSON\.stringify\(item\.metadata\)/);
});

test("Listening forms make unlimited plays explicit and expose styled primary and secondary actions", async () => {
  const editor = await read("../app/TeacherListeningEditor.tsx");
  assert.match(editor, /Để trống: không giới hạn lượt nghe\./);
  assert.match(editor, /listening-primary-button/);
  assert.match(editor, /listening-secondary-button/);
  assert.match(editor, /listening-add-question-button/);
});
