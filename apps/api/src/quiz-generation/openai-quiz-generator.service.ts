import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import type { GeneratedQuizQuestion, VocabularyRecord } from "./quiz-generation.types";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "sourceWord", "prompt", "options", "correctAnswer"],
        properties: {
          kind: { type: "string", enum: ["EN_TO_VI_MCQ", "VI_TO_EN_MCQ", "CONTEXT_FILL", "TRUE_FALSE"] },
          sourceWord: { type: "string" },
          prompt: { type: "string" },
          options: { type: ["array", "null"], items: { type: "string" }, minItems: 2, maxItems: 4 },
          correctAnswer: { type: "string" },
        },
      },
    },
  },
} as const;

const instructions = `You generate English vocabulary quizzes for school students.
Use ONLY the supplied vocabulary records containing word, Vietnamese meaning, and example sentence.
Never change a teacher-provided meaning or introduce another meaning.
Use clear, age-appropriate Vietnamese or English prompts and avoid duplicate or ambiguous questions.
Prefer distractors from other supplied records. Each MCQ must contain exactly one correct option and unique options.
For CONTEXT_FILL, use ____ only when the supplied example contains the source word exactly.
For TRUE_FALSE, correctAnswer must be TRUE or FALSE. Return only the required structured output.`;

@Injectable()
export class OpenAIQuizGenerator {
  async generate(vocabulary: VocabularyRecord[], count: number, config: { apiKey: string; model: string; timeoutMs: number }): Promise<GeneratedQuizQuestion[]> {
    const client = new OpenAI({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 0 });
    const response = await client.responses.create({
      model: config.model,
      store: false,
      max_output_tokens: Math.min(12_000, Math.max(2_000, count * 450)),
      instructions,
      input: JSON.stringify({ requestedQuestionCount: count, vocabulary: vocabulary.map(({ word, meaning, example }) => ({ word, meaning, example })) }),
      text: { format: { type: "json_schema", name: "quick_vocabulary_quiz", strict: true, schema } },
    });
    if (!response.output_text?.trim()) throw new Error("AI_EMPTY_RESPONSE");
    const parsed = JSON.parse(response.output_text) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) throw new Error("AI_INVALID_SCHEMA");
    return parsed.questions as GeneratedQuizQuestion[];
  }
}

