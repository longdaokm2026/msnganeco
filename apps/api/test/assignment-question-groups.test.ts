import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupAssignmentQuestions } from "../../../app/assignment-question-groups";

const passages = [
  { id: "second", title: "Second", content: "Second passage", position: 2 },
  { id: "first", title: "First", content: "First passage", position: 1 },
  { id: "empty", title: "Empty", content: "No questions", position: 3 },
];
const questions = [
  { id: "p2-q2", passageId: "second", position: 8 },
  { id: "standalone-2", passageId: null, position: 3 },
  { id: "p1-q2", passageId: "first", position: 6 },
  { id: "standalone-1", passageId: null, position: 1 },
  { id: "p2-q1", passageId: "second", position: 7 },
  { id: "p1-q1", passageId: "first", position: 4 },
];

describe("assignment question grouping", () => {
  test("keeps standalone questions outside reading groups in question position order", () => {
    const grouped = groupAssignmentQuestions(questions, passages);
    assert.deepEqual(grouped.standaloneQuestions.map((item) => item.id), ["standalone-1", "standalone-2"]);
  });

  test("orders passages and keeps questions under their exact passageId without mixing", () => {
    const grouped = groupAssignmentQuestions(questions, passages);
    assert.deepEqual(grouped.passageGroups.map((group) => group.passage.id), ["first", "second"]);
    assert.deepEqual(grouped.passageGroups[0]?.questions.map((item) => item.id), ["p1-q1", "p1-q2"]);
    assert.deepEqual(grouped.passageGroups[1]?.questions.map((item) => item.id), ["p2-q1", "p2-q2"]);
  });

  test("preserves global numbering and hides passages without questions", () => {
    const grouped = groupAssignmentQuestions(questions, passages);
    assert.equal(grouped.questionNumberById.get("p1-q1"), 3);
    assert.equal(grouped.questionNumberById.get("p2-q2"), 6);
    assert.equal(grouped.passageGroups.some((group) => group.passage.id === "empty"), false);
  });

  test("hides the reading section data when there are no passage questions", () => {
    const grouped = groupAssignmentQuestions(questions.filter((item) => item.passageId === null), passages);
    assert.equal(grouped.passageGroups.length, 0);
  });

  test("uses the same grouping for result records with additional fields", () => {
    const resultQuestions = questions.map((item) => ({ ...item, isCorrect: true, studentAnswer: "answer" }));
    const grouped = groupAssignmentQuestions(resultQuestions, passages);
    assert.equal(grouped.passageGroups[0]?.questions[0]?.studentAnswer, "answer");
    assert.equal(grouped.passageGroups[0]?.questions[0]?.id, "p1-q1");
  });
});
