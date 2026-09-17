import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("Lesson Word import and export UI", () => {
  test("places all Word actions in the teacher lesson editor", async () => {
    const source = await read("../app/TeacherLessonManager.tsx");
    assert.match(source, /"Tải mẫu Word"/);
    assert.match(source, /"Import Word"/);
    assert.match(source, /"Export Word"/);
    assert.match(source, /accept="\.docx,application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document"/);
  });

  test("requires preview and an explicit apply action without auto-saving", async () => {
    const source = await read("../app/TeacherLessonManager.tsx");
    assert.match(source, /setImportPreview\(preview\)/);
    assert.match(source, />Áp dụng vào biểu mẫu</);
    assert.match(source, /Hãy kiểm tra và bấm Lưu/);
    const applyBody = source.match(/function applyImport\(\) \{([\s\S]*?)\n\s{2}\}/)?.[1] ?? "";
    assert.match(applyBody, /setLesson/);
    assert.doesNotMatch(applyBody, /persist|method:\s*"PUT"/);
  });

  test("blocks exporting unsaved changes", async () => {
    const source = await read("../app/TeacherLessonManager.tsx");
    assert.match(source, /disabled=\{busy \|\| isDirty\}/);
    assert.match(source, /Hãy lưu thay đổi trước khi xuất Word/);
  });
});
