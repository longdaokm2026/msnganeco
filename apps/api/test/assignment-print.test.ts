import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { printableQuestion } from "../../shared/assignment-print";

// Cấu hình phía giáo viên có chứa đáp án; bản in tuyệt đối không được để lọt.
const teacherChoice = { options: [{ id: "A", text: "difficult" }, { id: "B", text: "easy" }, { id: "C", text: "activity" }], correctOptionId: "C" };
const teacherMatching = { pairs: [{ leftId: "l1", leftText: "do projects", rightId: "r2", rightText: "làm các dự án" }, { leftId: "l2", leftText: "play games", rightId: "r1", rightText: "chơi trò chơi" }] };
const teacherBlank = { acceptedAnswers: ["painting", "a painting"] };
const teacherOrder = { tokens: [{ id: "t1", text: "are" }, { id: "t2", text: "What" }], correctOrder: ["t2", "t1"] };

describe("Assignment print view", () => {
  test("không để lọt đáp án của bất kỳ loại câu hỏi nào", () => {
    const rendered = [
      printableQuestion("VOCAB_MULTIPLE_CHOICE", teacherChoice),
      printableQuestion("VOCAB_MATCHING", teacherMatching),
      printableQuestion("VOCAB_FILL_BLANK", teacherBlank),
      printableQuestion("GRAMMAR_SENTENCE_ORDER", teacherOrder),
      printableQuestion("READING_TRUE_FALSE_NOT_GIVEN", { correctAnswer: "FALSE" }),
    ];

    const serialized = JSON.stringify(rendered);
    for (const leak of ["correctOptionId", "acceptedAnswers", "correctAnswer", "correctOrder", "painting", "leftId", "rightId"]) {
      assert.ok(!serialized.includes(leak), `bản in để lọt “${leak}”`);
    }
  });

  test("giữ lại nội dung lựa chọn để học sinh chọn trên giấy", () => {
    const result = printableQuestion("VOCAB_MULTIPLE_CHOICE", teacherChoice);

    assert.deepEqual(result, { kind: "choice", options: ["difficult", "easy", "activity"] });
  });

  test("xếp lại cột phải của câu nối cặp để không lộ cách ghép", () => {
    const result = printableQuestion("VOCAB_MATCHING", teacherMatching);

    assert.equal(result.kind, "matching");
    assert.deepEqual(result, { kind: "matching", left: ["do projects", "play games"], right: ["chơi trò chơi", "làm các dự án"] });
  });

  test("đọc được cả cấu hình rút gọn phía học sinh", () => {
    const studentMatching = { left: [{ id: "l1", text: "do projects" }], right: [{ id: "r1", text: "chơi trò chơi" }] };

    assert.deepEqual(printableQuestion("VOCAB_MATCHING", studentMatching), { kind: "matching", left: ["do projects"], right: ["chơi trò chơi"] });
    assert.deepEqual(printableQuestion("READING_TRUE_FALSE_NOT_GIVEN", { values: ["TRUE", "FALSE"] }), { kind: "truefalse", values: ["TRUE", "FALSE"] });
  });

  test("chừa dòng kẻ cho câu tự luận, nhiều hơn cho câu trả lời ngắn", () => {
    assert.deepEqual(printableQuestion("VOCAB_FILL_BLANK", teacherBlank), { kind: "text", answerLines: 1 });
    assert.deepEqual(printableQuestion("READING_SHORT_ANSWER", {}), { kind: "text", answerLines: 2 });
    assert.deepEqual(printableQuestion("GRAMMAR_ERROR_CORRECTION", {}), { kind: "text", answerLines: 2 });
  });

  test("chịu được cấu hình hỏng mà không văng lỗi", () => {
    assert.deepEqual(printableQuestion("VOCAB_MULTIPLE_CHOICE", null), { kind: "choice", options: [] });
    assert.deepEqual(printableQuestion("GRAMMAR_SENTENCE_ORDER", { tokens: "hỏng" }), { kind: "order", tokens: [] });
  });
});
