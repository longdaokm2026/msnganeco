import type { AssignmentQuestionType } from "../../../../generated/prisma/client";

type JsonRecord = Record<string, unknown>;
type QuestionForResult = { type: AssignmentQuestionType; config: unknown };
type AnswerForResult = { answer: unknown; isCorrect: boolean | null } | null | undefined;

const record = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const records = (value: unknown) => Array.isArray(value) ? value.filter(record) : [];
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "Chưa trả lời";
const tfng: Record<string, string> = { TRUE: "Đúng", FALSE: "Sai", NOT_GIVEN: "Không có thông tin" };
const multipleChoice = new Set(["VOCAB_MULTIPLE_CHOICE", "GRAMMAR_MULTIPLE_CHOICE", "READING_MULTIPLE_CHOICE"]);
const textQuestion = new Set(["VOCAB_FILL_BLANK", "GRAMMAR_FILL_BLANK", "GRAMMAR_ERROR_CORRECTION", "READING_SHORT_ANSWER"]);

export type ObjectiveResult = { correctCount: number; totalQuestions: number; percentage: number };
export type HumanReadableQuestionResult = {
  isCorrect: boolean;
  studentAnswer: string;
  correctAnswer?: string;
  matching?: { correctPairs: number; totalPairs: number };
};

export function objectiveResult(answers: { isCorrect: boolean | null }[], totalQuestions: number): ObjectiveResult {
  const correctCount = answers.filter((answer) => answer.isCorrect === true).length;
  return { correctCount, totalQuestions, percentage: totalQuestions ? correctCount / totalQuestions * 100 : 0 };
}

export function humanReadableQuestionResult(question: QuestionForResult, storedAnswer: AnswerForResult, revealCorrectAnswer = true): HumanReadableQuestionResult {
  const config = record(question.config) ? question.config : {};
  const answer = record(storedAnswer?.answer) ? storedAnswer.answer : {};
  const base = { isCorrect: storedAnswer?.isCorrect === true };

  if (multipleChoice.has(question.type)) {
    const options = records(config.options);
    const optionText = (id: unknown) => text(options.find((option) => option.id === id)?.text);
    return { ...base, studentAnswer: optionText(answer.selectedOptionId), ...(revealCorrectAnswer ? { correctAnswer: optionText(config.correctOptionId) } : {}) };
  }
  if (question.type === "READING_TRUE_FALSE_NOT_GIVEN") {
    const label = (value: unknown) => tfng[String(value)] ?? "Chưa trả lời";
    return { ...base, studentAnswer: label(answer.value), ...(revealCorrectAnswer ? { correctAnswer: label(config.correctAnswer) } : {}) };
  }
  if (textQuestion.has(question.type)) {
    const accepted = strings(config.acceptedAnswers).map((item) => item.trim()).filter(Boolean);
    return { ...base, studentAnswer: text(answer.text), ...(revealCorrectAnswer ? { correctAnswer: accepted.length ? accepted.join(" / ") : "Không có đáp án mẫu" } : {}) };
  }
  if (question.type === "VOCAB_MATCHING") {
    const pairs = records(config.pairs);
    const mappings = records(answer.mappings);
    const rightText = (rightId: unknown) => text(pairs.find((pair) => pair.rightId === rightId)?.rightText);
    let correctPairs = 0;
    const studentPairs = pairs.map((pair) => {
      const mapping = mappings.find((item) => item.leftId === pair.leftId);
      if (mapping?.rightId === pair.rightId) correctPairs += 1;
      return `${text(pair.leftText)} → ${rightText(mapping?.rightId)}`;
    });
    const correctPairsText = pairs.map((pair) => `${text(pair.leftText)} → ${text(pair.rightText)}`);
    return { ...base, studentAnswer: studentPairs.join("; "), ...(revealCorrectAnswer ? { correctAnswer: correctPairsText.join("; ") } : {}), matching: { correctPairs, totalPairs: pairs.length } };
  }
  const tokens = records(config.tokens);
  const tokenText = (id: string) => text(tokens.find((token) => token.id === id)?.text);
  const ordered = strings(answer.orderedIds).map(tokenText).join(" ") || "Chưa trả lời";
  const correct = strings(config.correctOrder).map(tokenText).join(" ") || "Không có đáp án mẫu";
  return { ...base, studentAnswer: ordered, ...(revealCorrectAnswer ? { correctAnswer: correct } : {}) };
}
