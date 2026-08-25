import { Injectable } from "@nestjs/common";
import type { GeneratedQuizQuestion, VocabularyRecord } from "./quiz-generation.types";

const normalized = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("en");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function distinct(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => { const key = normalized(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

function options(correct: string, candidates: string[], position: number) {
  const values = distinct([correct, ...candidates]).slice(0, 4);
  const shift = values.length ? position % values.length : 0;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

function contextQuestion(item: VocabularyRecord): GeneratedQuizQuestion | null {
  if (!item.example) return null;
  const expression = new RegExp(`\\b${escape(item.word)}\\b`, "iu");
  if (!expression.test(item.example)) return null;
  return { kind: "CONTEXT_FILL", sourceWord: item.word, prompt: item.example.replace(expression, "____"), correctAnswer: item.word };
}

@Injectable()
export class LocalQuizGenerator {
  generate(vocabulary: VocabularyRecord[], count: number): GeneratedQuizQuestion[] {
    const selected = vocabulary.slice(0, count);
    return selected.map((item, index) => {
      const otherMeanings = vocabulary.filter((entry) => normalized(entry.meaning) !== normalized(item.meaning)).map((entry) => entry.meaning);
      const otherWords = vocabulary.filter((entry) => normalized(entry.word) !== normalized(item.word)).map((entry) => entry.word);
      const kind = index % 4;
      if (kind === 1 && otherWords.length) return { kind: "VI_TO_EN_MCQ", sourceWord: item.word, prompt: `Từ tiếng Anh nào có nghĩa là “${item.meaning}”?`, options: options(item.word, otherWords, index), correctAnswer: item.word };
      if (kind === 2) {
        const context = contextQuestion(item);
        if (context) return context;
      }
      if (kind === 3) {
        const falseMeaning = otherMeanings[index % Math.max(1, otherMeanings.length)];
        const truth = index % 2 === 0 || !falseMeaning;
        return { kind: "TRUE_FALSE", sourceWord: item.word, prompt: `“${item.word}” có nghĩa là “${truth ? item.meaning : falseMeaning}”.`, correctAnswer: truth ? "TRUE" : "FALSE" };
      }
      if (otherMeanings.length) return { kind: "EN_TO_VI_MCQ", sourceWord: item.word, prompt: `“${item.word}” có nghĩa là gì?`, options: options(item.meaning, otherMeanings, index), correctAnswer: item.meaning };
      const context = contextQuestion(item);
      return context ?? { kind: "TRUE_FALSE", sourceWord: item.word, prompt: `“${item.word}” có nghĩa là “${item.meaning}”.`, correctAnswer: "TRUE" };
    });
  }
}

