import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AssignmentDocumentService, docxMime } from "../src/assignments/assignment-document.service";
import { gradeQuestion, validateQuestion } from "../src/assignments/grading";

const service = new AssignmentDocumentService();
const upload = (buffer: Buffer) => ({ originalname: "bai-tap.docx", mimetype: docxMime, size: buffer.length, buffer }) as never;
const importDocx = (buffer: Buffer) => service.parseImport(upload(buffer));

describe("Assignment Word template", () => {
  test("mẫu tải về đọc lại được đủ bảy câu, đoạn đọc và phần viết", async () => {
    const result = await importDocx(await service.createTemplate());

    assert.deepEqual(result.questions.map((question) => question.type), [
      "VOCAB_MULTIPLE_CHOICE", "VOCAB_FILL_BLANK", "VOCAB_MATCHING",
      "GRAMMAR_SENTENCE_ORDER", "GRAMMAR_ERROR_CORRECTION",
      "READING_MULTIPLE_CHOICE", "READING_TRUE_FALSE_NOT_GIVEN",
    ]);
    assert.equal(result.passages.length, 1);
    assert.equal(result.writing?.type, "ESSAY");
    assert.deepEqual(result.warnings, []);
    assert.equal(result.totalPoints, 9);
  });

  test("mọi câu sinh ra từ mẫu đều qua được kiểm tra của hệ thống", async () => {
    const result = await importDocx(await service.createTemplate());

    for (const question of result.questions) {
      const error = validateQuestion({ ...question, required: true, passageId: null, listeningTrackId: null });
      assert.equal(error, null, `${question.type}: ${error}`);
    }
  });

  test("đáp án đọc từ file chấm ra điểm tối đa", async () => {
    const result = await importDocx(await service.createTemplate());
    const find = (type: string) => result.questions.find((question) => question.type === type)!;

    const choice = find("VOCAB_MULTIPLE_CHOICE");
    assert.equal(gradeQuestion(choice, { selectedOptionId: (choice.config as { correctOptionId: string }).correctOptionId }).awardedPoints, 1);
    const order = find("GRAMMAR_SENTENCE_ORDER");
    assert.equal(gradeQuestion(order, { orderedIds: (order.config as { correctOrder: string[] }).correctOrder }).awardedPoints, 2);
    const trueFalse = find("READING_TRUE_FALSE_NOT_GIVEN");
    assert.equal(gradeQuestion(trueFalse, { value: "FALSE" }).awardedPoints, 1);
  });

  test("câu hỏi nối đúng đoạn đọc của nó", async () => {
    const result = await importDocx(await service.createTemplate());
    const reading = result.questions.filter((question) => question.section === "READING");

    assert.equal(reading.length, 2);
    for (const question of reading) assert.equal(question.passageNumber, 1);
  });

  test("một vòng export rồi import giữ nguyên nội dung", async () => {
    const first = await importDocx(await service.createTemplate());

    const second = await importDocx(await service.exportAssignment({ ...first, title: "Unit 7" }));

    assert.equal(second.title, "Unit 7");
    assert.deepEqual(second.questions.map((question) => question.type), first.questions.map((question) => question.type));
    assert.deepEqual(second.questions.map((question) => question.config), first.questions.map((question) => question.config));
    assert.deepEqual(second.passages, first.passages);
    assert.equal(second.totalPoints, first.totalPoints);
  });

  test("bỏ qua câu sai định dạng và báo lại cho giáo viên", async () => {
    const source = await importDocx(await service.createTemplate());
    const broken = await service.exportAssignment({
      ...source,
      questions: [
        source.questions[0],
        { ...source.questions[1], config: { acceptedAnswers: [] } },
      ],
    });

    const result = await importDocx(broken);

    assert.equal(result.questions.length, 1);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Đáp án/u);
  });

  test("từ chối file không phải .docx", async () => {
    await assert.rejects(() => service.parseImport({ originalname: "x.txt", mimetype: "text/plain", size: 4, buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]) } as never), /\.docx/u);
    await assert.rejects(() => service.parseImport({ originalname: "x.docx", mimetype: docxMime, size: 3, buffer: Buffer.from("abc") } as never), /không hợp lệ|bị hỏng/u);
  });
});
