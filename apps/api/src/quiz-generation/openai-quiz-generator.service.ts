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
        required: ["type", "pattern", "sourceWord", "prompt", "options", "correctAnswer", "pairs"],
        properties: {
          type: { type: "string", enum: ["MULTIPLE_CHOICE", "MATCHING", "FILL_BLANK", "TRUE_FALSE"] },
          pattern: { type: "string", enum: ["EN_TO_VI", "VI_TO_EN", "SENTENCE_COMPLETION", "SITUATION", "ODD_ONE_OUT", "MEANING_IN_CONTEXT", "MATCHING", "TRUE_FALSE"] },
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

const instructions = `You generate a varied and educational English vocabulary Quick Quiz for school students.

Use ONLY the supplied teacher vocabulary records: English word, Vietnamese meaning, and example sentence. Do not invent target vocabulary or replace a teacher-provided meaning.

For a 20-question final quiz, aim for approximately: 25% English word to Vietnamese meaning, 20% Vietnamese meaning to English word, 20% sentence completion, 15% best word for a simple real-life situation, 10% category or odd-one-out, and 10% meaning-in-context or simple inference. Scale this mix proportionally for other final quiz sizes and for the larger candidate pool.

Do not generate more than two consecutive questions with the same pattern. Avoid repeatedly using prompts such as “What does X mean?”, “What is the Vietnamese meaning of X?”, or “Choose the correct Vietnamese meaning of X?”. Use simple meaning questions only as part of the mix.

Every question must have exactly one correct answer, plausible and unique distractors, age-appropriate language, unambiguous wording, and no knowledge outside the supplied vocabulary. Avoid culturally obscure facts.

For sentence completion, the correct option must fit both grammar and meaning. Reuse the teacher example when useful, or write a short sentence using common English. Include ____ in the prompt.
For situation questions, use simple everyday contexts and select the best supplied word.
For category or odd-one-out, generate a question only when at least four supplied words clearly form a comparable set with one grounded odd item.
For meaning-in-context, keep the target word visible in a short context and test only its supplied meaning.

Use MULTIPLE_CHOICE for all six preferred patterns. Set pattern accurately. Options and the correct answer must be exact supplied words or meanings. Use null for fields that do not apply. Return only the required structured output.`;

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
