import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { docxMime, LessonDocumentService } from "../src/lessons/lesson-document.service";

const service = new LessonDocumentService();
const asUpload = (buffer: Buffer) => ({ originalname: "lesson.docx", mimetype: docxMime, size: buffer.length, buffer }) as never;
const importDocx = (buffer: Buffer) => service.parseImport(asUpload(buffer));

// Dựng file theo đúng hình dạng Word tạo ra: mỗi mục đánh số là một list paragraph riêng,
// các dòng con nằm cùng một dòng và chỉ cách nhau bằng khoảng trắng đôi.
async function legacyDocument(label: string, lines: string[]) {
  const numbering = { config: [{ reference: "legacy", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] };
  const children = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: label })] })];
  for (const line of lines) children.push(new Paragraph({ numbering: { reference: "legacy", level: 0, instance: 1 }, children: [new TextRun({ text: line })] }));
  return Buffer.from(await Packer.toBuffer(new Document({ numbering, sections: [{ children }] })));
}

describe("Lesson Word template", () => {
  test("giữ gạch đầu dòng, số thứ tự và dòng con qua một vòng export/import", async () => {
    const lesson = {
      title: "Unit 3 – The World Around Us",
      summary: "Chủ đề môi trường và nông nghiệp.",
      mainContent: "- Reading: Gapped Text.\n- Speaking: môi trường và kế hoạch tương lai.",
      theory: "- Open Cloze: xác định loại từ còn thiếu.",
      vocabulary: "travel | /ˈtræv.əl/ | du lịch | travel abroad | I love to travel.\nwheat | /wiːt/ | lúa mì | grow wheat | Wheat is an important crop.",
      grammar: "1. Present Continuous\n   S + am/is/are + V-ing\n   Dùng cho kế hoạch đã quyết định.\n2. Be going to\n   S + am/is/are going to + V\n   Dùng cho dự đoán có bằng chứng.",
      examples: "- I'm meeting my classmates tomorrow.\n- The bus leaves at 7:30.",
      reviewNotes: "- Ôn toàn bộ từ vựng Unit 3.",
      homeworkNotes: "Hoàn thành bài tập được giao.",
    };

    const exported = await service.exportLesson(lesson);
    const result = await importDocx(exported);

    assert.deepEqual(result.fields, lesson);
    assert.equal(result.vocabularyCount, 2);
    assert.deepEqual(result.missingSections, []);
  });

  test("đánh số liên tục qua các danh sách rời nhau và bỏ số gõ tay", async () => {
    const buffer = await legacyDocument("NGỮ PHÁP", [
      "Present Continuous  S + am/is/are + V-ing  Dùng cho kế hoạch đã quyết định.",
      "Be going to  S + am/is/are going to + V",
      "3. Will  S + will + V",
    ]);

    const result = await importDocx(buffer);

    assert.equal(
      result.fields.grammar,
      [
        "1. Present Continuous",
        "   S + am/is/are + V-ing",
        "   Dùng cho kế hoạch đã quyết định.",
        "2. Be going to",
        "   S + am/is/are going to + V",
        "3. Will",
        "   S + will + V",
      ].join("\n"),
    );
  });

  test("giữ bảng từ vựng 5 cột và bỏ dòng tiêu đề", async () => {
    const exported = await service.exportLesson({ vocabulary: "crop | /krɒp/ | cây trồng | grow crops | Farmers grow crops." });

    const result = await importDocx(exported);

    assert.equal(result.fields.vocabulary, "crop | /krɒp/ | cây trồng | grow crops | Farmers grow crops.");
    assert.equal(result.vocabularyCount, 1);
  });

  test("vẫn đọc được file mẫu cũ không có gạch đầu dòng", async () => {
    const buffer = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "TÓM TẮT / MỤC TIÊU" })] }),
      new Paragraph({ children: [new TextRun({ text: "Mục tiêu: sử dụng từ vựng du lịch." })] }),
    ] }] })));

    const result = await importDocx(buffer);

    assert.equal(result.fields.summary, "Mục tiêu: sử dụng từ vựng du lịch.");
  });
});
