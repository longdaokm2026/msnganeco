import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { AssignmentQuestionType } from "../../../generated/prisma/client";
import { attemptDurationMs, attemptExpired } from "../src/assignments/attempt-timing";
import { gradeQuestion } from "../src/assignments/grading";
import { LocalQuizGenerator } from "../src/quiz-generation/local-quiz-generator.service";
import type { OpenAIQuizGenerator } from "../src/quiz-generation/openai-quiz-generator.service";
import { rankLeaderboard } from "../src/quiz-generation/leaderboard";
import { QuizGenerationService } from "../src/quiz-generation/quiz-generation.service";
import type { GeneratedQuizQuestion, VocabularyRecord } from "../src/quiz-generation/quiz-generation.types";
import { toPersistedQuestion, validateGeneratedQuestions } from "../src/quiz-generation/quiz-generation.validator";
import { parseLessonVocabulary } from "../src/quiz-generation/vocabulary-parser";

const vocabulary: VocabularyRecord[] = [
  { word: "sunny", meaning: "có nắng", example: "It is sunny today.", lessonId: "l1", lessonTitle: "Weather" },
  { word: "rainy", meaning: "có mưa", example: "It is rainy today.", lessonId: "l1", lessonTitle: "Weather" },
  { word: "windy", meaning: "có gió", example: "It is windy today.", lessonId: "l1", lessonTitle: "Weather" },
  { word: "cloudy", meaning: "nhiều mây", example: "It is cloudy today.", lessonId: "l1", lessonTitle: "Weather" },
];

const originalEnv = { enabled: process.env.AI_QUIZ_ENABLED, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
afterEach(() => {
  if (originalEnv.enabled === undefined) delete process.env.AI_QUIZ_ENABLED; else process.env.AI_QUIZ_ENABLED = originalEnv.enabled;
  if (originalEnv.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalEnv.key;
  if (originalEnv.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = originalEnv.model;
});

function service(generate: (...args: unknown[]) => Promise<GeneratedQuizQuestion[]>) {
  return new QuizGenerationService({ generate } as unknown as OpenAIQuizGenerator, new LocalQuizGenerator());
}

const validAi = (): GeneratedQuizQuestion[] => [
  { kind: "EN_TO_VI_MCQ", sourceWord: "sunny", prompt: "‘sunny’ có nghĩa là gì?", options: ["có mưa", "có nắng", "có gió"], correctAnswer: "có nắng" },
  { kind: "VI_TO_EN_MCQ", sourceWord: "rainy", prompt: "Từ nào có nghĩa là ‘có mưa’?", options: ["sunny", "rainy", "windy"], correctAnswer: "rainy" },
];

describe("Quick Quiz deterministic local generation", () => {
  test("parses only safe teacher vocabulary formats", () => {
    const parsed = parseLessonVocabulary({ id: "l1", title: "Lesson", scheduledStart: new Date(), vocabulary: "sunny | có nắng | It is sunny.\nrainy => có mưa => It is rainy.\nunsafe free text" });
    assert.deepEqual(parsed.map(({ word, meaning, example }) => ({ word, meaning, example })), [{ word: "sunny", meaning: "có nắng", example: "It is sunny." }, { word: "rainy", meaning: "có mưa", example: "It is rainy." }]);
  });

  test("creates grounded English/Vietnamese MCQ, context and true/false without internet", () => {
    const questions = new LocalQuizGenerator().generate(vocabulary, 4);
    assert.deepEqual(questions.map((question) => question.kind), ["EN_TO_VI_MCQ", "VI_TO_EN_MCQ", "CONTEXT_FILL", "TRUE_FALSE"]);
    for (const question of questions.filter((item) => item.options)) assert.equal(new Set(question.options!.map((item) => item.toLowerCase())).size, question.options!.length);
    const persisted = questions.map(toPersistedQuestion);
    const mcq = persisted[0]; const config = mcq.config as { options: { id: string; text: string }[]; correctOptionId: string };
    const correct = config.options.find((option) => option.id === config.correctOptionId);
    assert.equal(correct?.text, "có nắng");
    assert.equal(gradeQuestion({ type: mcq.type, points: mcq.points, config: mcq.config }, { selectedOptionId: correct!.id }).isCorrect, true);
    assert.equal(persisted[1].type, AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE);
  });

  test("works with a missing key or AI disabled and never invokes OpenAI", async () => {
    let calls = 0; const generator = service(async () => { calls += 1; return []; });
    process.env.AI_QUIZ_ENABLED = "true"; delete process.env.OPENAI_API_KEY;
    assert.equal((await generator.generate(vocabulary, 4)).mode, "LOCAL");
    process.env.AI_QUIZ_ENABLED = "false"; process.env.OPENAI_API_KEY = "test-only";
    assert.equal((await generator.generate(vocabulary, 4)).mode, "LOCAL");
    assert.equal(calls, 0);
  });
});

describe("Quick Quiz AI validation and automatic fallback", () => {
  test("uses one successful structured AI result", async () => {
    process.env.AI_QUIZ_ENABLED = "true"; process.env.OPENAI_API_KEY = "test-only"; process.env.OPENAI_MODEL = "test-model";
    let calls = 0; const result = await service(async () => { calls += 1; return validAi(); }).generate(vocabulary, 2);
    assert.equal(calls, 1); assert.equal(result.mode, "AI"); assert.equal(result.model, "test-model"); assert.equal(result.questions.length, 2);
  });

  for (const failure of ["timeout", "network", "401", "429", "500", "SDK exception"]) {
    test(`${failure} falls back locally`, async () => {
      process.env.AI_QUIZ_ENABLED = "true"; process.env.OPENAI_API_KEY = "test-only";
      const result = await service(async () => { throw new Error(failure); }).generate(vocabulary, 2);
      assert.equal(result.mode, "LOCAL"); assert.equal(result.questions.length, 2);
    });
  }

  test("invalid schema and insufficient valid AI questions fall back locally", async () => {
    process.env.AI_QUIZ_ENABLED = "true"; process.env.OPENAI_API_KEY = "test-only";
    assert.equal((await service(async () => [{ kind: "EN_TO_VI_MCQ", sourceWord: "unknown", prompt: "Bad", options: ["x", "y"], correctAnswer: "x" }]).generate(vocabulary, 2)).mode, "LOCAL");
    assert.equal((await service(async () => validAi().slice(0, 1)).generate(vocabulary, 2)).mode, "LOCAL");
    assert.deepEqual(validateGeneratedQuestions({ questions: validAi() }, vocabulary, 2), []);
  });
});

describe("Quick Quiz server timing and leaderboard", () => {
  test("calculates duration on the server and enforces a time limit", () => {
    const started = new Date("2026-08-25T00:00:00.000Z"); const submitted = new Date("2026-08-25T00:01:40.000Z");
    assert.equal(attemptDurationMs(started, submitted), 100_000);
    assert.equal(attemptExpired(started, 2, new Date("2026-08-25T00:01:59.000Z")), false);
    assert.equal(attemptExpired(started, 2, new Date("2026-08-25T00:02:01.000Z")), true);
  });

  test("selects best of three and ranks correctness before speed without exposing answers", () => {
    const start = new Date("2026-08-25T00:00:00.000Z");
    const at = (id: string, studentId: string, fullName: string, correct: number, seconds: number, attemptNumber = 1) => ({ id, student: { id: studentId, fullName }, attemptNumber, startedAt: start, submittedAt: new Date(start.getTime() + seconds * 1000), answers: Array.from({ length: 20 }, (_, index) => ({ isCorrect: index < correct })) });
    const entries = rankLeaderboard([
      at("a1", "a", "Student A", 15, 80, 1), at("a2", "a", "Student A", 20, 100, 2), at("a3", "a", "Student A", 20, 110, 3),
      at("b", "b", "Student B", 20, 120), at("c", "c", "Student C", 19, 80),
    ], 20);
    assert.deepEqual(entries.map((entry) => entry.student.id), ["a", "b", "c"]);
    assert.equal(entries[0].attemptNumber, 2); assert.equal(entries[0].durationMs, 100_000);
    assert.equal(JSON.stringify(entries).includes("answers"), false);
  });
});
