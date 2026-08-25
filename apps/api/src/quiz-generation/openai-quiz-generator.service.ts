import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { AIQuizGenerationError, openAIErrorDetails, safeAIErrorMessage } from "./ai-quiz-generation.error";
import type { VocabularyRecord } from "./quiz-generation.types";

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
        required: ["type", "sourceWord", "prompt", "options", "correctAnswer", "pairs"],
        properties: {
          type: { type: "string", enum: ["MULTIPLE_CHOICE", "MATCHING", "FILL_BLANK", "TRUE_FALSE"] },
          sourceWord: { type: ["string", "null"] },
          prompt: { type: "string" },
          options: { type: ["array", "null"], items: { type: "string" }, minItems: 2, maxItems: 4 },
          correctAnswer: { type: ["string", "null"] },
          pairs: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["left", "right"],
              properties: { left: { type: "string" }, right: { type: "string" } },
            },
            minItems: 2,
          },
        },
      },
    },
  },
} as const;

const instructions = `You generate English vocabulary quizzes for school students.
Goal: produce a varied pool of valid candidate questions so the server can select the requested final quiz size.
Success means the candidate pool is diverse, grounded, non-duplicate, and contains enough valid questions after server validation.
Use ONLY the supplied vocabulary records containing word, Vietnamese meaning, and example sentence.
Never change a teacher-provided meaning or introduce another meaning.
Use clear, age-appropriate Vietnamese or English prompts and avoid duplicate or ambiguous questions.
Prefer distractors from other supplied records. Each MCQ must contain exactly one correct option and unique options.
Aim for this distribution: 40% English-to-Vietnamese multiple choice, 20% Vietnamese-to-English multiple choice, 20% fill blank from exact examples, 10% true/false, and 10% matching.
Use different source words and prompt wording where possible. A source word may appear in more than one question only when the question skill or direction is meaningfully different.
For MULTIPLE_CHOICE, ask either English-to-Vietnamese or Vietnamese-to-English and keep the supplied meaning exact.
For FILL_BLANK, use ____ only when the supplied example contains the source word exactly.
For TRUE_FALSE, correctAnswer must be TRUE or FALSE.
For MATCHING, use exact supplied word/meaning pairs. Use null for fields that do not apply to a question type.
Return only the required structured output.`;

@Injectable()
export class OpenAIQuizGenerator {
  async generate(vocabulary: VocabularyRecord[], count: number, config: { apiKey: string; model: string; timeoutMs: number; finalQuestionCount?: number }): Promise<unknown[]> {
    const client = new OpenAI({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 0 });
    return generateQuizWithResponses((input) => client.responses.create(input), vocabulary, count, config.model, config.finalQuestionCount);
  }
}

type CreateResponse = (input: OpenAI.Responses.ResponseCreateParamsNonStreaming) => Promise<unknown>;

function outputTextFrom(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return "";
  const value = response as { output_text?: unknown; output?: unknown };
  if (typeof value.output_text === "string" && value.output_text.trim()) return value.output_text.trim();
  if (!Array.isArray(value.output)) return "";
  return value.output.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => part && typeof part === "object" && !Array.isArray(part) && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []);
  }).join("").trim();
}

export async function generateQuizWithResponses(createResponse: CreateResponse, vocabulary: VocabularyRecord[], count: number, model: string, finalQuestionCount = count): Promise<unknown[]> {
  let response: unknown;
  try {
    response = await createResponse({
      model,
      store: false,
      max_output_tokens: Math.min(12_000, Math.max(2_000, count * 450)),
      instructions,
      input: JSON.stringify({ candidateQuestionCount: count, finalQuestionCount, vocabulary: vocabulary.map(({ word, meaning, example }) => ({ word, meaning, example })) }),
      text: { format: { type: "json_schema", name: "quick_vocabulary_quiz", strict: true, schema } },
    });
  } catch (error) {
    throw new AIQuizGenerationError("request", safeAIErrorMessage(error), openAIErrorDetails(error));
  }

  const status = response && typeof response === "object" && !Array.isArray(response) ? (response as { status?: unknown }).status : undefined;
  if (typeof status === "string" && status !== "completed") throw new AIQuizGenerationError("response_parse", `OpenAI response status was ${status}`);
  const outputText = outputTextFrom(response);
  if (!outputText) throw new AIQuizGenerationError("response_parse", "OpenAI response did not contain output text");

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AIQuizGenerationError("response_parse", "OpenAI output text was not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as { questions?: unknown }).questions)) throw new AIQuizGenerationError("schema_validation", "OpenAI structured output did not contain a questions array");
  return (parsed as { questions: unknown[] }).questions;
}
