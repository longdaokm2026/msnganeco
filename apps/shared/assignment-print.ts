// Chuẩn hóa cấu hình câu hỏi về dạng in được, cố ý bỏ mọi thông tin đáp án.
// Màn giáo viên giữ đáp án trong config, màn học sinh thì không, nên hàm này
// nhận cả hai dạng và chỉ lấy ra phần đề bài.
export type PrintableQuestion =
  | { kind: "choice"; options: string[] }
  | { kind: "truefalse"; values: string[] }
  | { kind: "matching"; left: string[]; right: string[] }
  | { kind: "order"; tokens: string[] }
  | { kind: "text"; answerLines: number };

type Entry = { id?: unknown; text?: unknown };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const entries = (value: unknown) => Array.isArray(value) ? value.filter(record) as Entry[] : [];
const texts = (value: unknown) => entries(value).map((item) => String(item.text ?? "")).filter(Boolean);

const trueFalseValues = (type: string, config: Record<string, unknown>) => {
  const declared = Array.isArray(config.values) ? config.values.map(String) : null;
  if (declared?.length) return declared;
  return type === "LISTENING_TRUE_FALSE" || config.quickQuizVocabulary === true ? ["TRUE", "FALSE"] : ["TRUE", "FALSE", "NOT_GIVEN"];
};

export function printableQuestion(type: string, rawConfig: unknown): PrintableQuestion {
  const config = record(rawConfig) ? rawConfig : {};
  if (type.endsWith("MULTIPLE_CHOICE")) return { kind: "choice", options: texts(config.options) };
  if (type.endsWith("TRUE_FALSE") || type.endsWith("TRUE_FALSE_NOT_GIVEN")) return { kind: "truefalse", values: trueFalseValues(type, config) };
  if (type.endsWith("MATCHING")) {
    // Dạng giáo viên lưu từng cặp; cột phải phải xếp lại theo mã để không lộ đáp án.
    const pairs = entries(config.pairs);
    if (pairs.length) {
      const left = pairs.map((pair) => String((pair as Record<string, unknown>).leftText ?? ""));
      const right = [...pairs].sort((a, b) => String((a as Record<string, unknown>).rightId ?? "").localeCompare(String((b as Record<string, unknown>).rightId ?? ""))).map((pair) => String((pair as Record<string, unknown>).rightText ?? ""));
      return { kind: "matching", left, right };
    }
    return { kind: "matching", left: texts(config.left), right: texts(config.right) };
  }
  if (type === "GRAMMAR_SENTENCE_ORDER") return { kind: "order", tokens: texts(config.tokens) };
  return { kind: "text", answerLines: type.endsWith("SHORT_ANSWER") || type.endsWith("ERROR_CORRECTION") ? 2 : 1 };
}
