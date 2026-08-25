import { randomUUID } from "node:crypto";
import { AssignmentQuestionType, AssignmentSection } from "../../../../generated/prisma/client";
import type { GeneratedQuizQuestion, PersistedQuestionInput, VocabularyRecord } from "./quiz-generation.types";

const normalized = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("en");
const nonblank = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function validateGeneratedQuestions(raw: unknown, vocabulary: VocabularyRecord[], limit: number): GeneratedQuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  const source = new Map(vocabulary.map((item) => [normalized(item.word), item]));
  const words = new Set(vocabulary.map((item) => normalized(item.word)));
  const meanings = new Set(vocabulary.map((item) => normalized(item.meaning)));
  const prompts = new Set<string>();
  const valid: GeneratedQuizQuestion[] = [];
  for (const value of raw) {
    if (!record(value)) continue;
    const declaredKind = nonblank(value.kind) ? value.kind : nonblank(value.type) ? value.type : "";
    const aliasedKind = declaredKind === "FILL_BLANK" ? "CONTEXT_FILL" : declaredKind;
    if (!nonblank(value.prompt)) continue;
    const promptKey = normalized(value.prompt);
    if (prompts.has(promptKey)) continue;
    if (aliasedKind === "MATCHING") {
      if (!Array.isArray(value.pairs)) continue;
      const pairs = value.pairs.flatMap((pair) => {
        if (!record(pair)) return [];
        const left = nonblank(pair.left) ? pair.left.trim() : nonblank(pair.word) ? pair.word.trim() : "";
        const right = nonblank(pair.right) ? pair.right.trim() : nonblank(pair.meaning) ? pair.meaning.trim() : "";
        const sourceItem = source.get(normalized(left));
        return sourceItem && normalized(sourceItem.meaning) === normalized(right) ? [{ left: sourceItem.word, right: sourceItem.meaning }] : [];
      });
      if (pairs.length < 2 || pairs.length !== value.pairs.length || new Set(pairs.map((pair) => normalized(pair.left))).size !== pairs.length || new Set(pairs.map((pair) => normalized(pair.right))).size !== pairs.length) continue;
      prompts.add(promptKey);
      valid.push({ kind: "MATCHING", sourceWord: pairs[0].left, prompt: value.prompt.trim(), pairs });
      if (valid.length === limit) break;
      continue;
    }
    if (!["EN_TO_VI_MCQ", "VI_TO_EN_MCQ", "CONTEXT_FILL", "TRUE_FALSE", "MULTIPLE_CHOICE"].includes(aliasedKind) || !nonblank(value.sourceWord) || !nonblank(value.correctAnswer)) continue;
    const sourceRecord = source.get(normalized(value.sourceWord));
    if (!sourceRecord) continue;
    const kind = aliasedKind === "MULTIPLE_CHOICE"
      ? normalized(value.correctAnswer) === normalized(sourceRecord.meaning) ? "EN_TO_VI_MCQ" : normalized(value.correctAnswer) === normalized(sourceRecord.word) ? "VI_TO_EN_MCQ" : ""
      : aliasedKind;
    if (!kind) continue;
    const item: { kind: "EN_TO_VI_MCQ" | "VI_TO_EN_MCQ" | "CONTEXT_FILL" | "TRUE_FALSE"; sourceWord: string; prompt: string; options: unknown; correctAnswer: string } = { kind: kind as "EN_TO_VI_MCQ" | "VI_TO_EN_MCQ" | "CONTEXT_FILL" | "TRUE_FALSE", sourceWord: value.sourceWord, prompt: value.prompt, options: value.options, correctAnswer: value.correctAnswer };
    const prompt = item.prompt;
    const recordItem = sourceRecord;
    if (item.kind === "EN_TO_VI_MCQ" && normalized(item.correctAnswer!) !== normalized(recordItem.meaning)) continue;
    if ((item.kind === "VI_TO_EN_MCQ" || item.kind === "CONTEXT_FILL") && normalized(item.correctAnswer!) !== normalized(recordItem.word)) continue;
    if (item.kind === "EN_TO_VI_MCQ" && !normalized(item.prompt!).includes(normalized(recordItem.word))) continue;
    if (item.kind === "VI_TO_EN_MCQ" && !normalized(item.prompt!).includes(normalized(recordItem.meaning))) continue;
    if (item.kind === "CONTEXT_FILL") {
      const groundedPrompt = recordItem.example?.replace(new RegExp(`\\b${recordItem.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "iu"), "____");
      if (!groundedPrompt || normalized(item.prompt) !== normalized(groundedPrompt)) continue;
    }
    if (item.kind === "TRUE_FALSE") {
      if (!["TRUE", "FALSE"].includes(item.correctAnswer!) || !normalized(item.prompt!).includes(normalized(recordItem.word))) continue;
      const quotedMeaning = vocabulary.find((entry) => normalized(prompt).includes(normalized(entry.meaning)))?.meaning;
      if (!quotedMeaning || (item.correctAnswer === "TRUE") !== (normalized(quotedMeaning) === normalized(recordItem.meaning))) continue;
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
    valid.push({ kind: item.kind, sourceWord: recordItem.word, prompt: item.prompt.trim(), options: Array.isArray(item.options) ? item.options as string[] : undefined, correctAnswer: item.correctAnswer.trim() });
    if (valid.length === limit) break;
  }
  return valid;
}

export function toPersistedQuestion(item: GeneratedQuizQuestion): PersistedQuestionInput {
  if (item.kind === "MATCHING") return { type: AssignmentQuestionType.VOCAB_MATCHING, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { pairs: item.pairs!.map((pair) => ({ leftId: randomUUID(), leftText: pair.left, rightId: randomUUID(), rightText: pair.right })) } };
  if (item.kind === "TRUE_FALSE") return { type: AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { correctAnswer: item.correctAnswer, quickQuizVocabulary: true } };
  if (item.kind === "CONTEXT_FILL") return { type: AssignmentQuestionType.VOCAB_FILL_BLANK, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { acceptedAnswers: [item.correctAnswer!], caseSensitive: false } };
  const options = item.options!.map((text) => ({ id: randomUUID(), text }));
  const correct = options.find((option) => normalized(option.text) === normalized(item.correctAnswer!));
  return { type: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, section: AssignmentSection.VOCABULARY, prompt: item.prompt, explanation: null, points: 1, required: true, config: { options, correctOptionId: correct!.id } };
}
