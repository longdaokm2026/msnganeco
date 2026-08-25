import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AssignmentQuestionType } from "../../../generated/prisma/client";
import { gradeQuestion, normalizeAnswer, studentConfig } from "../src/assignments/grading";
import { assignmentPublishError, calculateAssignmentOutcome, missingRequiredReadAloud } from "../src/assignments/manual-grading";

describe("Assignment deterministic grading", () => {
  test("keeps auto-only grading unchanged and correctly finalizes mixed manual scores", () => {
    assert.deepEqual(calculateAssignmentOutcome({ automaticScore: 48, automaticMaxScore: 60 }), { status: "AUTO_GRADED", score: 48, maxScore: 60, percentage: 80 });
    assert.deepEqual(calculateAssignmentOutcome({ automaticScore: 48, automaticMaxScore: 60, manualMaxScore: 10 }), { status: "PENDING_MANUAL_GRADE", score: 48, maxScore: 70, percentage: null });
    assert.deepEqual(calculateAssignmentOutcome({ automaticScore: 48, automaticMaxScore: 60, manualMaxScore: 10, manualScore: 8.5 }), { status: "FULLY_GRADED", score: 56.5, maxScore: 70, percentage: 56.5 / 70 * 100 });
    assert.equal(missingRequiredReadAloud({ id: "task" }, null), true);
    assert.equal(missingRequiredReadAloud({ id: "task" }, { id: "audio" }), false);
    assert.equal(assignmentPublishError({ title: "Read", questionCount: 0, readAloudTask: { readingText: "Hello", maxScore: 10 } }), null);
    assert.match(assignmentPublishError({ title: "Read", questionCount: 0, readAloudTask: { readingText: " ", maxScore: 10 } }) ?? "", /nội dung bài đọc/);
  });
  test("grades multiple choice and true/false/not given by exact identifiers", () => {
    const mcq = gradeQuestion({ type: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, points: 2, config: { correctOptionId: "b" } }, { selectedOptionId: "b" });
    const tfng = gradeQuestion({ type: AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, points: 1, config: { correctAnswer: "NOT_GIVEN" } }, { value: "FALSE" });
    assert.deepEqual([mcq.isCorrect, mcq.awardedPoints], [true, 2]);
    assert.deepEqual([tfng.isCorrect, tfng.awardedPoints], [false, 0]);
  });

  test("normalizes Unicode, case and repeated whitespace without fuzzy grading", () => {
    assert.equal(normalizeAnswer("  GOES   to school  "), "goes to school");
    const fill = gradeQuestion({ type: AssignmentQuestionType.GRAMMAR_FILL_BLANK, points: 2, config: { acceptedAnswers: ["goes to school"] } }, { text: " GOES   TO SCHOOL " });
    const correction = gradeQuestion({ type: AssignmentQuestionType.GRAMMAR_ERROR_CORRECTION, points: 2, config: { acceptedAnswers: ["She goes home."] } }, { text: "she goes home" });
    const reading = gradeQuestion({ type: AssignmentQuestionType.READING_SHORT_ANSWER, points: 2, config: { acceptedAnswers: ["Hà Nội"] } }, { text: "hà nội" });
    assert.equal(fill.isCorrect, true); assert.equal(correction.isCorrect, false); assert.equal(reading.isCorrect, true);
  });

  test("awards partial matching credit and exact sentence-order credit", () => {
    const matching = gradeQuestion({ type: AssignmentQuestionType.VOCAB_MATCHING, points: 4, config: { pairs: [{ leftId: "a", rightId: "1" }, { leftId: "b", rightId: "2" }] } }, { mappings: [{ leftId: "a", rightId: "1" }, { leftId: "b", rightId: "1" }] });
    const ordered = gradeQuestion({ type: AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER, points: 3, config: { correctOrder: ["one", "two"] } }, { orderedIds: ["two", "one"] });
    assert.equal(matching.awardedPoints, 2); assert.equal(matching.isCorrect, false); assert.equal(ordered.awardedPoints, 0);
  });

  test("supports vocabulary fill blank and calculates a stable total", () => {
    const values = [
      gradeQuestion({ type: AssignmentQuestionType.VOCAB_FILL_BLANK, points: 1.5, config: { acceptedAnswers: ["apple"] } }, { text: "Apple" }),
      gradeQuestion({ type: AssignmentQuestionType.READING_MULTIPLE_CHOICE, points: 2.5, config: { correctOptionId: "x" } }, { selectedOptionId: "x" }),
    ];
    assert.equal(values.reduce((sum, item) => sum + item.awardedPoints, 0), 4);
  });

  test("student configurations strip every answer key and de-correlate ordered solutions", () => {
    const matching = studentConfig(AssignmentQuestionType.VOCAB_MATCHING, { pairs: [{ leftId: "left-a", leftText: "A", rightId: "z", rightText: "One" }, { leftId: "left-b", leftText: "B", rightId: "a", rightText: "Two" }] });
    const order = studentConfig(AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER, { tokens: [{ id: "z", text: "First" }, { id: "a", text: "Second" }], correctOrder: ["z", "a"] });
    const fill = studentConfig(AssignmentQuestionType.READING_SHORT_ANSWER, { acceptedAnswers: ["secret"] });
    assert.equal(JSON.stringify({ matching, order, fill }).includes("acceptedAnswers"), false);
    assert.equal(JSON.stringify({ matching, order, fill }).includes("correctOrder"), false);
    assert.deepEqual((matching as { right: { id: string }[] }).right.map((item) => item.id), ["a", "z"]);
    assert.deepEqual((order as { tokens: { id: string }[] }).tokens.map((item) => item.id), ["a", "z"]);
  });
});
