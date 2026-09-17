import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("student vocabulary viewer renders all five vocabulary fields", async () => {
  const viewer = await read("../app/VocabularyViewer.tsx");
  for (const heading of ["Từ", "Phiên âm", "Nghĩa", "Cụm từ", "Câu ví dụ"]) {
    assert.match(viewer, new RegExp(`>${heading}<`));
  }
  assert.match(viewer, /line\.pronunciation/);
  assert.match(viewer, /line\.phrase/);
  assert.match(viewer, /colSpan=\{5\}/);
});
