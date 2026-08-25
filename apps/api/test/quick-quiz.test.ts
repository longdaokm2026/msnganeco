import "dotenv/config";
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { AssignmentQuestionType } from "../../../generated/prisma/client";
import { attemptDurationMs, attemptExpired } from "../src/assignments/attempt-timing";
import { gradeQuestion } from "../src/assignments/grading";
import { AIQuizGenerationError } from "../src/quiz-generation/ai-quiz-generation.error";
import { LocalQuizGenerator } from "../src/quiz-generation/local-quiz-generator.service";
import { generateQuizWithResponses, OpenAIQuizGenerator } from "../src/quiz-generation/openai-quiz-generator.service";
import { QuickQuizController } from "../src/quiz-generation/quick-quiz.controller";
import { QuickQuizRepository } from "../src/quiz-generation/quick-quiz.repository";
import { QuickQuizService } from "../src/quiz-generation/quick-quiz.service";
import { rankLeaderboard } from "../src/quiz-generation/leaderboard";
import { aiCandidateCount, QuizGenerationService } from "../src/quiz-generation/quiz-generation.service";
import type { GeneratedQuizQuestion, VocabularyRecord } from "../src/quiz-generation/quiz-generation.types";
import { toPersistedQuestion, validateGeneratedQuestions, validateGeneratedQuestionsWithDiagnostics } from "../src/quiz-generation/quiz-generation.validator";
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

function service(generate: (...args: unknown[]) => Promise<unknown[]>) {
  return new QuizGenerationService({ generate } as unknown as OpenAIQuizGenerator, new LocalQuizGenerator());
}

const validAi = (): GeneratedQuizQuestion[] => [
  { kind: "EN_TO_VI_MCQ", sourceWord: "sunny", prompt: "‘sunny’ có nghĩa là gì?", options: ["có mưa", "có nắng", "có gió"], correctAnswer: "có nắng" },
  { kind: "VI_TO_EN_MCQ", sourceWord: "rainy", prompt: "Từ nào có nghĩa là ‘có mưa’?", options: ["sunny", "rainy", "windy"], correctAnswer: "rainy" },
];

describe("Quick Quiz deterministic local generation", () => {
  test("declares every production dependency token explicitly for the tsx runtime", () => {
    const tokenAt = (target: object, index: number) => (Reflect.getMetadata("self:paramtypes", target) as { index: number; param: unknown }[] | undefined)?.find((item) => item.index === index)?.param;
    assert.equal(tokenAt(QuickQuizController, 0), QuickQuizService);
    assert.equal(tokenAt(QuickQuizService, 0), QuickQuizRepository);
    assert.equal(tokenAt(QuickQuizService, 1), QuizGenerationService);
    assert.equal(tokenAt(QuizGenerationService, 0), OpenAIQuizGenerator);
    assert.equal(tokenAt(QuizGenerationService, 1), LocalQuizGenerator);
  });

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
  test("requests a bounded candidate buffer and accepts the requested valid subset in one AI call", async () => {
    process.env.AI_QUIZ_ENABLED = "true"; process.env.OPENAI_API_KEY = "test-only"; process.env.OPENAI_MODEL = "test-model";
    let calls = 0; let candidateCount = 0; let finalQuestionCount = 0;
    const result = await service(async (...args) => {
      calls += 1;
      candidateCount = args[1] as number;
      finalQuestionCount = (args[2] as { finalQuestionCount: number }).finalQuestionCount;
      return [
        { type: "ESSAY", prompt: "Unsupported" },
        { type: "MULTIPLE_CHOICE", sourceWord: "unknown", prompt: "Unknown", options: ["x", "y"], correctAnswer: "x" },
        ...validAi(),
        { ...validAi()[0], prompt: "Another valid sunny question" },
      ];
    }).generate(vocabulary, 2);
    assert.equal(calls, 1);
    assert.equal(candidateCount, aiCandidateCount(2));
    assert.equal(finalQuestionCount, 2);
    assert.equal(result.mode, "AI");
    assert.equal(result.questions.length, 2);
  });

  test("caps candidate buffer growth", () => {
    assert.equal(aiCandidateCount(20), 27);
    assert.equal(aiCandidateCount(100), 108);
  });

  test("parses Responses API output_text and uses AI generation mode", async () => {
    process.env.AI_QUIZ_ENABLED = "true"; process.env.OPENAI_API_KEY = "test-only"; process.env.OPENAI_MODEL = "test-model";
    let request: Record<string, unknown> | undefined;
    const structuredQuestions = [
      { type: "MULTIPLE_CHOICE", pattern: "EN_TO_VI", sourceWord: "sunny", prompt: "‘sunny’ có nghĩa là gì?", options: ["có mưa", "có nắng", "có gió"], correctAnswer: "có nắng" },
      { type: "MULTIPLE_CHOICE", pattern: "VI_TO_EN", sourceWord: "rainy", prompt: "Từ nào có nghĩa là ‘có mưa’?", options: ["sunny", "rainy", "windy"], correctAnswer: "rainy" },
    ];
    const raw = await generateQuizWithResponses(async (input) => {
      request = input as unknown as Record<string, unknown>;
      return { status: "completed", output_text: JSON.stringify({ questions: structuredQuestions }) };
    }, vocabulary, 2, "test-model");
    const result = await service(async () => raw).generate(vocabulary, 2);
    assert.equal(request?.model, "test-model");
    assert.equal("response_format" in (request ?? {}), false);
    assert.equal(((request?.text as { format?: { type?: string } })?.format?.type), "json_schema");
    const questionSchema = (((request?.text as { format?: { schema?: { properties?: { questions?: { items?: { properties?: Record<string, { type?: unknown }> } } } } } })?.format?.schema?.properties?.questions?.items?.properties) ?? {});
    assert.equal(questionSchema.sourceWord?.type, "string");
    assert.equal(questionSchema.correctAnswer?.type, "string");
    assert.equal(questionSchema.options?.type, "array");
    assert.equal(result.mode, "AI"); assert.equal(result.model, "test-model"); assert.equal(result.questions.length, 2);
  });

  test("safely extracts output_text content from response.output", async () => {
    const questions = await generateQuizWithResponses(async () => ({ status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify({ questions: validAi() }) }] }] }), vocabulary, 2, "test-model");
    assert.equal(questions.length, 2);
  });

  test("classifies malformed, empty and invalid-schema output by the exact stage", async () => {
    const failure = async (response: unknown) => {
      try { await generateQuizWithResponses(async () => response, vocabulary, 2, "test-model"); assert.fail("Expected generation to fail"); }
      catch (error) { assert.equal(error instanceof AIQuizGenerationError, true); return (error as AIQuizGenerationError).stage; }
    };
    assert.equal(await failure({ status: "completed", output_text: "{" }), "response_parse");
    assert.equal(await failure({ status: "completed", output_text: "" }), "response_parse");
    assert.equal(await failure({ status: "completed", output_text: JSON.stringify({ items: [] }) }), "schema_validation");
  });

  test("normalizes generic vocabulary question types and discards unsupported types", () => {
    const raw = [
      { type: "MULTIPLE_CHOICE", sourceWord: "sunny", prompt: "What does sunny mean?", options: ["có nắng", "có mưa"], correctAnswer: "có nắng" },
      { type: "FILL_BLANK", sourceWord: "rainy", prompt: "It is ____ today.", options: null, correctAnswer: "rainy" },
      { type: "MATCHING", prompt: "Nối từ với nghĩa", pairs: [{ left: "sunny", right: "có nắng" }, { left: "rainy", right: "có mưa" }] },
      { type: "ESSAY", sourceWord: "windy", prompt: "Write an essay", correctAnswer: "windy" },
    ];
    const normalized = validateGeneratedQuestions(raw, vocabulary, 10);
    assert.deepEqual(normalized.map((item) => item.kind), ["EN_TO_VI_MCQ", "CONTEXT_FILL", "MATCHING"]);
    assert.deepEqual(normalized.map(toPersistedQuestion).map((item) => item.type), [AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, AssignmentQuestionType.VOCAB_FILL_BLANK, AssignmentQuestionType.VOCAB_MATCHING]);
    const diagnostics = validateGeneratedQuestionsWithDiagnostics(raw, vocabulary, 10);
    assert.equal(diagnostics.generatedCount, 4);
    assert.equal(diagnostics.rejections.unsupported_type, 1);
  });

  test("accepts grounded varied patterns and rejects a third consecutive pattern", () => {
    const raw = [
      { type: "MULTIPLE_CHOICE", pattern: "SITUATION", sourceWord: "sunny", prompt: "The sky is bright and there are no clouds. Which word fits best?", options: ["sunny", "rainy", "windy"], correctAnswer: "sunny" },
      { type: "MULTIPLE_CHOICE", pattern: "SITUATION", sourceWord: "rainy", prompt: "Take an umbrella because water is falling from the sky. Which word fits?", options: ["sunny", "rainy", "cloudy"], correctAnswer: "rainy" },
      { type: "MULTIPLE_CHOICE", pattern: "SITUATION", sourceWord: "windy", prompt: "The trees are moving strongly. Which word fits?", options: ["sunny", "rainy", "windy"], correctAnswer: "windy" },
      { type: "MULTIPLE_CHOICE", pattern: "ODD_ONE_OUT", sourceWord: "cloudy", prompt: "Choose the odd one out.", options: ["sunny", "rainy", "windy", "cloudy"], correctAnswer: "cloudy" },
      { type: "MULTIPLE_CHOICE", pattern: "MEANING_IN_CONTEXT", sourceWord: "windy", prompt: "It is windy, so hold your hat. What does windy mean?", options: ["có nắng", "có mưa", "có gió"], correctAnswer: "có gió" },
      { type: "MULTIPLE_CHOICE", pattern: "SENTENCE_COMPLETION", sourceWord: "sunny", prompt: "Today is ____ and bright.", options: ["sunny", "rainy", "cloudy"], correctAnswer: "sunny" },
    ];
    const result = validateGeneratedQuestionsWithDiagnostics(raw, vocabulary, 10);
    assert.deepEqual(result.questions.map((item) => item.pattern), ["SITUATION", "SITUATION", "ODD_ONE_OUT", "MEANING_IN_CONTEXT", "SENTENCE_COMPLETION"]);
    assert.equal(result.rejections.pattern_run_exceeded, 1);
    assert.equal(result.questions.every((item) => toPersistedQuestion(item).type === AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE), true);
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

  test("malformed output, empty output and request errors fall back locally", async () => {
    process.env.AI_QUIZ_ENABLED = "true"; process.env.OPENAI_API_KEY = "test-only";
    const responses = [
      async () => ({ status: "completed", output_text: "{" }),
      async () => ({ status: "completed", output_text: "" }),
      async () => { const error = Object.assign(new Error("Request failed"), { status: 500, type: "server_error", code: "internal_error" }); throw error; },
    ];
    for (const create of responses) {
      const result = await service(async () => generateQuizWithResponses(create, vocabulary, 2, "test-model")).generate(vocabulary, 2);
      assert.equal(result.mode, "LOCAL");
      assert.equal(result.questions.length, 2);
    }
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
