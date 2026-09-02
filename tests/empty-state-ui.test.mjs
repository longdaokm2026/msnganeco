import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared empty state uses an accessible classroom illustration across role screens", async () => {
  const [component, classroom, lesson, assignments, guardian, dashboard] = await Promise.all([
    read("../app/EmptyState.tsx"),
    read("../app/ClassroomManager.tsx"),
    read("../app/TeacherLessonManager.tsx"),
    read("../app/StudentAssignmentManager.tsx"),
    read("../app/GuardianPortal.tsx"),
    read("../app/page.tsx"),
  ]);

  assert.match(component, /aria-label="Minh họa lớp học"/);
  assert.match(component, /content-empty-state/);
  for (const screen of [classroom, lesson, assignments, guardian, dashboard]) {
    assert.match(screen, /<EmptyState/);
  }
});
