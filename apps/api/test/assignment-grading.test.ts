import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AssignmentQuestionType } from "../../../generated/prisma/client";
import { gradeQuestion, normalizeAnswer, studentConfig, validateQuestion } from "../src/assignments/grading";
import { assignmentPublishError, missingRequiredReadAloud } from "../src/assignments/manual-grading";
import { humanReadableQuestionResult, objectiveResult } from "../src/assignments/result-view";

describe("Assignment deterministic grading", () => {
  test("keeps objective accuracy separate from the fixed 0–10 read-aloud score", () => {
    assert.deepEqual(objectiveResult([{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }, { isCorrect: true }, { isCorrect: false }, { isCorrect: true }, { isCorrect: true }, { isCorrect: false }], 8), { correctCount: 5, totalQuestions: 8, percentage: 62.5 });
    assert.equal(missingRequiredReadAloud({ id: "task" }, null), true);
    assert.equal(missingRequiredReadAloud({ id: "task" }, { id: "audio" }), false);
    assert.equal(assignmentPublishError({ title: "Read", questionCount: 0, readAloudTask: { readingText: "Hello", maxScore: 10 } }), null);
    assert.match(assignmentPublishError({ title: "Read", questionCount: 0, readAloudTask: { readingText: " ", maxScore: 10 } }) ?? "", /nội dung bài đọc/);
  });

  test("renders human-readable answers for every question family without leaking IDs or JSON", () => {
    const mcq = humanReadableQuestionResult({ type: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, config: { options: [{ id: "option-secret-uuid", text: "Apple" }, { id: "correct-secret-uuid", text: "Banana" }], correctOptionId: "correct-secret-uuid" } }, { answer: { selectedOptionId: "option-secret-uuid" }, isCorrect: false });
    const tfng = humanReadableQuestionResult({ type: AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, config: { correctAnswer: "NOT_GIVEN" } }, { answer: { value: "FALSE" }, isCorrect: false });
    const fill = humanReadableQuestionResult({ type: AssignmentQuestionType.GRAMMAR_FILL_BLANK, config: { acceptedAnswers: ["goes", "does go"] } }, { answer: { text: "go" }, isCorrect: false });
    const matching = humanReadableQuestionResult({ type: AssignmentQuestionType.VOCAB_MATCHING, config: { pairs: [{ leftId: "left-secret", leftText: "Cat", rightId: "right-secret", rightText: "Mèo" }] } }, { answer: { mappings: [{ leftId: "left-secret", rightId: "right-secret" }] }, isCorrect: true });
    const ordering = humanReadableQuestionResult({ type: AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER, config: { tokens: [{ id: "token-one", text: "I" }, { id: "token-two", text: "learn" }], correctOrder: ["token-one", "token-two"] } }, { answer: { orderedIds: ["token-two", "token-one"] }, isCorrect: false });
    assert.deepEqual([mcq.studentAnswer, mcq.correctAnswer], ["Apple", "Banana"]);
    assert.deepEqual([tfng.studentAnswer, tfng.correctAnswer], ["Sai", "Không có thông tin"]);
    assert.deepEqual([fill.studentAnswer, fill.correctAnswer], ["go", "goes / does go"]);
    assert.deepEqual(matching.matching, { correctPairs: 1, totalPairs: 1 });
    assert.deepEqual([matching.studentAnswer, matching.correctAnswer], ["Cat → Mèo", "Cat → Mèo"]);
    assert.deepEqual([ordering.studentAnswer, ordering.correctAnswer], ["learn I", "I learn"]);
    assert.equal(humanReadableQuestionResult({ type: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, config: { options: [{ id: "a", text: "Ẩn" }], correctOptionId: "a" } }, { answer: { selectedOptionId: "a" }, isCorrect: true }, false).correctAnswer, undefined);
    const serialized = JSON.stringify({ mcq, tfng, fill, matching, ordering });
    for (const secret of ["option-secret-uuid", "correct-secret-uuid", "left-secret", "right-secret", "token-one", "token-two"]) assert.equal(serialized.includes(secret), false);
  });
  test("grades multiple choice and true/false/not given by exact identifiers", () => {
    const mcq = gradeQuestion({ type: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, points: 2, config: { correctOptionId: "b" } }, { selectedOptionId: "b" });
    const tfng = gradeQuestion({ type: AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, points: 1, config: { correctAnswer: "NOT_GIVEN" } }, { value: "FALSE" });
    assert.deepEqual([mcq.isCorrect, mcq.awardedPoints], [true, 2]);
    assert.deepEqual([tfng.isCorrect, tfng.awardedPoints], [false, 0]);
  });

  test("allows the explicitly marked vocabulary true/false adapter without weakening normal section validation", () => {
    const base = { type: AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, prompt: "‘Sunny’ có nghĩa là ‘có nắng’.", explanation: null, points: 1, required: true, passageId: null };
    assert.equal(validateQuestion({ ...base, section: "VOCABULARY", config: { correctAnswer: "TRUE", quickQuizVocabulary: true } }), null);
    assert.match(validateQuestion({ ...base, section: "VOCABULARY", config: { correctAnswer: "TRUE" } }) ?? "", /không thuộc đúng phần/);
    assert.match(validateQuestion({ ...base, section: "VOCABULARY", config: { correctAnswer: "NOT_GIVEN", quickQuizVocabulary: true } }) ?? "", /TRUE hoặc FALSE/);
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
