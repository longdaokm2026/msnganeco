import { randomUUID } from "node:crypto";
import { AssignmentQuestionType, AssignmentSection } from "../../../../generated/prisma/client";
import type { GeneratedQuizQuestion, PersistedQuestionInput, VocabularyRecord } from "./quiz-generation.types";

const normalized = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("en");
const nonblank = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());

export function validateGeneratedQuestions(raw: unknown, vocabulary: VocabularyRecord[], limit: number): GeneratedQuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  const source = new Map(vocabulary.map((item) => [normalized(item.word), item]));
  const words = new Set(vocabulary.map((item) => normalized(item.word)));
  const meanings = new Set(vocabulary.map((item) => normalized(item.meaning)));
  const prompts = new Set<string>();
  const valid: GeneratedQuizQuestion[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Partial<GeneratedQuizQuestion>;
    if (!item.kind || !["EN_TO_VI_MCQ", "VI_TO_EN_MCQ", "CONTEXT_FILL", "TRUE_FALSE"].includes(item.kind) || !nonblank(item.sourceWord) || !nonblank(item.prompt) || !nonblank(item.correctAnswer)) continue;
    const prompt = item.prompt;
    const record = source.get(normalized(item.sourceWord));
    const promptKey = normalized(item.prompt);
    if (!record || prompts.has(promptKey)) continue;
    if (item.kind === "EN_TO_VI_MCQ" && normalized(item.correctAnswer) !== normalized(record.meaning)) continue;
    if ((item.kind === "VI_TO_EN_MCQ" || item.kind === "CONTEXT_FILL") && normalized(item.correctAnswer) !== normalized(record.word)) continue;
    if (item.kind === "EN_TO_VI_MCQ" && !normalized(item.prompt).includes(normalized(record.word))) continue;
    if (item.kind === "VI_TO_EN_MCQ" && !normalized(item.prompt).includes(normalized(record.meaning))) continue;
    if (item.kind === "CONTEXT_FILL") {
      const groundedPrompt = record.example?.replace(new RegExp(`\\b${record.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "iu"), "____");
      if (!groundedPrompt || normalized(item.prompt) !== normalized(groundedPrompt)) continue;
    }
    if (item.kind === "TRUE_FALSE") {
      if (!["TRUE", "FALSE"].includes(item.correctAnswer) || !normalized(item.prompt).includes(normalized(record.word))) continue;
      const quotedMeaning = vocabulary.find((entry) => normalized(prompt).includes(normalized(entry.meaning)))?.meaning;
      if (!quotedMeaning || (item.correctAnswer === "TRUE") !== (normalized(quotedMeaning) === normalized(record.meaning))) continue;
    }
    if (item.kind.endsWith("MCQ")) {
      if (!Array.isArray(item.options)) continue;
      const options = item.options.filter(nonblank).map((option) => option.trim());
      const unique = new Set(options.map(normalized));
      if (unique.size !== options.length || options.length < 2 || options.length > 4 || options.filter((option) => normalized(option) === normalized(item.correctAnswer!)).length !== 1) continue;
      if (options.some((option) => !(item.kind === "EN_TO_VI_MCQ" ? meanings : words).has(normalized(option)))) continue;
      item.options = options;
    }
    prompts.add(promptKey);
    valid.push({ kind: item.kind, sourceWord: record.word, prompt: item.prompt.trim(), options: item.options, correctAnswer: item.correctAnswer.trim() });
    if (valid.length === limit) break;
  }
  return valid;
}

export function toPersistedQuestion(item: GeneratedQuizQuestion): PersistedQuestionInput {
  if (item.kind === "TRUE_FALSE") return { type: AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { correctAnswer: item.correctAnswer } };
  if (item.kind === "CONTEXT_FILL") return { type: AssignmentQuestionType.VOCAB_FILL_BLANK, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { acceptedAnswers: [item.correctAnswer], caseSensitive: false } };
  const options = item.options!.map((text) => ({ id: randomUUID(), text }));
  const correct = options.find((option) => normalized(option.text) === normalized(item.correctAnswer));
  return { type: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { options, correctOptionId: correct!.id } };
}
