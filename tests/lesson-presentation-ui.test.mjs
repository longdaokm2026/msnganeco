import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("teacher Lesson screen opens a focused six-part presentation", async () => {
  const [manager, presentation] = await Promise.all([
    read("../app/TeacherLessonManager.tsx"),
    read("../app/LessonPresentation.tsx"),
  ]);
  assert.match(manager, /<LessonPresentation lesson=\{lesson\}/);
  assert.match(manager, />Trình chiếu</);
  for (const field of ["summary", "mainContent", "grammar", "examples"]) assert.match(presentation, new RegExp(`key: "${field}"`));
  assert.match(presentation, /lesson\.vocabulary/);
  for (const excluded of ["theory", "reviewNotes", "homeworkNotes", "attachments"]) {
    assert.doesNotMatch(presentation, new RegExp(excluded));
  }
  assert.ok(presentation.indexOf('title: "Tóm tắt / Mục tiêu"') < presentation.indexOf('title: "Nội dung chính"'));
  assert.ok(presentation.indexOf('title: "Ngữ pháp"') < presentation.indexOf('title: "Ví dụ"'));
  assert.ok(presentation.indexOf("textSections.slice(0, 2)") < presentation.indexOf("const vocabulary ="));
  assert.ok(presentation.indexOf("const vocabulary =") < presentation.indexOf("textSections.slice(2)"));
});

test("presentation supports keyboard, fullscreen and browser PDF printing", async () => {
  const [presentation, styles] = await Promise.all([
    read("../app/LessonPresentation.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(presentation, /window\.print\(\)/);
  assert.match(presentation, /requestFullscreen\(\)/);
  assert.match(presentation, /ArrowRight/);
  assert.match(presentation, /ArrowLeft/);
  assert.match(presentation, /In \/ Lưu PDF/);
  assert.match(styles, /@media print/);
  assert.match(styles, /page-break-after: always/);
  assert.match(styles, /lesson-presentation-slide/);
});

test("presentation paginates long text and vocabulary for readable slides", async () => {
  const presentation = await read("../app/LessonPresentation.tsx");
  assert.match(presentation, /splitPresentationText/);
  assert.match(presentation, /vocabularyRowsPerSlide = 5/);
  assert.match(presentation, /index \+= vocabularyRowsPerSlide/);
  assert.match(presentation, /parseVocabularyText/);
  assert.match(presentation, /Phiên âm/);
  assert.match(presentation, /Cụm từ/);
});
