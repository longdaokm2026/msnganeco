import { AssignmentQuestionType, AssignmentSection } from "../../../../generated/prisma/client";
import type { QuestionInput } from "./assignment.types";

type JsonRecord = Record<string, unknown>;
type GradeQuestion = { type: AssignmentQuestionType; points: number; config: unknown };
export type GradeResult = { isCorrect: boolean; awardedPoints: number; normalized: unknown };

const mcq = new Set<AssignmentQuestionType>([AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, AssignmentQuestionType.GRAMMAR_MULTIPLE_CHOICE, AssignmentQuestionType.READING_MULTIPLE_CHOICE, AssignmentQuestionType.LISTENING_MULTIPLE_CHOICE]);
const textAnswer = new Set<AssignmentQuestionType>([AssignmentQuestionType.VOCAB_FILL_BLANK, AssignmentQuestionType.GRAMMAR_FILL_BLANK, AssignmentQuestionType.GRAMMAR_ERROR_CORRECTION, AssignmentQuestionType.READING_SHORT_ANSWER, AssignmentQuestionType.LISTENING_FILL_BLANK]);
const matching = new Set<AssignmentQuestionType>([AssignmentQuestionType.VOCAB_MATCHING, AssignmentQuestionType.LISTENING_MATCHING]);
const trueFalse = new Set<AssignmentQuestionType>([AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, AssignmentQuestionType.LISTENING_TRUE_FALSE]);
const sectionFor = (type: AssignmentQuestionType) => type.startsWith("VOCAB_") ? AssignmentSection.VOCABULARY : type.startsWith("GRAMMAR_") ? AssignmentSection.GRAMMAR : type.startsWith("LISTENING_") ? AssignmentSection.LISTENING : AssignmentSection.READING;
const record = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : null;
const unique = (values: string[]) => new Set(values).size === values.length;

export function normalizeAnswer(value: string, caseSensitive = false) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return caseSensitive ? normalized : normalized.toLocaleLowerCase();
}

export function validateQuestion(input: QuestionInput) {
  const quickVocabularyTrueFalse = input.type === AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN && input.section === AssignmentSection.VOCABULARY && record(input.config) && input.config.quickQuizVocabulary === true;
  if (sectionFor(input.type) !== input.section && !quickVocabularyTrueFalse) return "Loại câu hỏi không thuộc đúng phần nội dung.";
  if (input.section === AssignmentSection.LISTENING && !input.listeningTrackId) return "Câu Listening phải thuộc một đoạn nghe.";
  if (input.section !== AssignmentSection.LISTENING && input.listeningTrackId) return "Chỉ câu Listening mới được liên kết với đoạn nghe.";
  if (input.section === AssignmentSection.LISTENING && input.passageId) return "Câu Listening không thể đồng thời thuộc đoạn Reading.";
  if (!input.prompt.trim()) return "Nội dung câu hỏi không được để trống.";
  if (!Number.isFinite(input.points) || input.points <= 0 || input.points > 1000) return "Điểm câu hỏi phải lớn hơn 0.";
  if (!record(input.config)) return "Cấu hình câu hỏi không hợp lệ.";
  const config = input.config;
  if (mcq.has(input.type)) {
    if (!Array.isArray(config.options) || config.options.length < 2 || config.options.length > 6) return "Câu trắc nghiệm cần từ 2 đến 6 lựa chọn.";
    const options = config.options.filter(record); const ids = options.map((item) => item.id); const texts = options.map((item) => item.text);
    if (options.length !== config.options.length || !ids.every((id) => typeof id === "string" && id) || !texts.every((text) => typeof text === "string" && text.trim()) || !unique(ids as string[])) return "Các lựa chọn phải có mã ổn định và nội dung không trống.";
    if (typeof config.correctOptionId !== "string" || !ids.includes(config.correctOptionId)) return "Cần chọn đúng một đáp án đúng.";
  } else if (trueFalse.has(input.type)) {
    const values = input.type === AssignmentQuestionType.LISTENING_TRUE_FALSE ? ["TRUE", "FALSE"] : ["TRUE", "FALSE", "NOT_GIVEN"];
    if (!values.includes(String(config.correctAnswer))) return input.type === AssignmentQuestionType.LISTENING_TRUE_FALSE ? "Đáp án Listening phải là TRUE hoặc FALSE." : "Đáp án phải là TRUE, FALSE hoặc NOT_GIVEN.";
    if (quickVocabularyTrueFalse && config.correctAnswer === "NOT_GIVEN") return "Quick Quiz từ vựng chỉ chấp nhận đáp án TRUE hoặc FALSE.";
  } else if (textAnswer.has(input.type)) {
    const accepted = strings(config.acceptedAnswers);
    if (!accepted?.length || accepted.some((item) => !item.trim())) return "Cần nhập ít nhất một đáp án được chấp nhận.";
  } else if (matching.has(input.type)) {
    if (!Array.isArray(config.pairs) || !config.pairs.length) return "Câu nối cặp cần ít nhất một cặp.";
    const pairs = config.pairs.filter(record); const leftIds = pairs.map((item) => item.leftId); const rightIds = pairs.map((item) => item.rightId);
    if (pairs.length !== config.pairs.length || !pairs.every((item) => typeof item.leftId === "string" && typeof item.rightId === "string" && typeof item.leftText === "string" && item.leftText.trim() && typeof item.rightText === "string" && item.rightText.trim()) || !unique(leftIds as string[]) || !unique(rightIds as string[])) return "Các cặp nối phải có mã duy nhất và nội dung không trống.";
  } else if (input.type === AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER) {
    if (!Array.isArray(config.tokens) || config.tokens.length < 2) return "Câu sắp xếp cần ít nhất hai thành phần.";
    const tokens = config.tokens.filter(record); const ids = tokens.map((item) => item.id);
    const order = strings(config.correctOrder);
    if (tokens.length !== config.tokens.length || !ids.every((id) => typeof id === "string" && id) || !tokens.every((item) => typeof item.text === "string" && item.text.trim()) || !unique(ids as string[]) || !order || order.length !== ids.length || !unique(order) || order.some((id) => !ids.includes(id))) return "Thứ tự đúng phải chứa chính xác các thành phần đã tạo.";
  }
  return null;
}

export function studentConfig(type: AssignmentQuestionType, raw: unknown) {
  const config = record(raw) ? raw : {};
  if (mcq.has(type)) return { options: config.options };
  if (trueFalse.has(type)) return { values: type === AssignmentQuestionType.LISTENING_TRUE_FALSE || config.quickQuizVocabulary === true ? ["TRUE", "FALSE"] : ["TRUE", "FALSE", "NOT_GIVEN"] };
  if (matching.has(type) && Array.isArray(config.pairs)) return { left: config.pairs.filter(record).map((item) => ({ id: item.leftId, text: item.leftText })), right: config.pairs.filter(record).map((item) => ({ id: item.rightId, text: item.rightText })).sort((a, b) => String(a.id).localeCompare(String(b.id))) };
  if (type === AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER && Array.isArray(config.tokens)) return { tokens: [...config.tokens].filter(record).sort((a, b) => String(a.id).localeCompare(String(b.id))) };
  return {};
}

export function gradeQuestion(question: GradeQuestion, rawAnswer: unknown): GradeResult {
  const config = record(question.config) ? question.config : {}; const answer = record(rawAnswer) ? rawAnswer : {};
  if (mcq.has(question.type)) {
    const selected = typeof answer.selectedOptionId === "string" ? answer.selectedOptionId : ""; const correct = selected === config.correctOptionId;
    return { isCorrect: correct, awardedPoints: correct ? question.points : 0, normalized: { selectedOptionId: selected } };
  }
  if (trueFalse.has(question.type)) {
    const value = typeof answer.value === "string" ? answer.value : ""; const correct = value === config.correctAnswer;
    return { isCorrect: correct, awardedPoints: correct ? question.points : 0, normalized: { value } };
  }
  if (textAnswer.has(question.type)) {
    const raw = typeof answer.text === "string" ? answer.text : ""; const caseSensitive = config.caseSensitive === true; const normalized = normalizeAnswer(raw, caseSensitive);
    const accepted = (strings(config.acceptedAnswers) ?? []).map((item) => normalizeAnswer(item, caseSensitive)); const correct = Boolean(normalized) && accepted.includes(normalized);
    return { isCorrect: correct, awardedPoints: correct ? question.points : 0, normalized: { text: normalized } };
  }
  if (matching.has(question.type)) {
    const solution = new Map((Array.isArray(config.pairs) ? config.pairs : []).filter(record).map((pair) => [String(pair.leftId), String(pair.rightId)]));
    const mappings = Array.isArray(answer.mappings) ? answer.mappings.filter(record) : []; const seen = new Set<string>(); let correctCount = 0;
    for (const mapping of mappings) { const leftId = String(mapping.leftId ?? ""); if (!seen.has(leftId) && solution.get(leftId) === mapping.rightId) correctCount += 1; seen.add(leftId); }
    const awardedPoints = solution.size ? question.points * correctCount / solution.size : 0;
    return { isCorrect: solution.size > 0 && correctCount === solution.size, awardedPoints, normalized: { mappings: mappings.map((item) => ({ leftId: String(item.leftId ?? ""), rightId: String(item.rightId ?? "") })) } };
  }
  const orderedIds = strings(answer.orderedIds) ?? []; const correctOrder = strings(config.correctOrder) ?? [];
  const correct = orderedIds.length === correctOrder.length && orderedIds.every((id, index) => id === correctOrder[index]);
  return { isCorrect: correct, awardedPoints: correct ? question.points : 0, normalized: { orderedIds } };
}
