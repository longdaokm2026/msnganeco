import { BadRequestException, Injectable } from "@nestjs/common";
import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import { HTMLElement, parse } from "node-html-parser";
import { extname } from "node:path";
import { AssignmentQuestionType, AssignmentSection, AssignmentType, WritingTaskType } from "../../../../generated/prisma/client";
import type { DocumentAssignment, DocumentPassage, DocumentQuestion, DocumentWriting, ImportPreview } from "./assignment-document.types";
import type { AudioUploadFile as UploadFile } from "./assignment-audio-storage.service";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const maxDocxBytes = 5 * 1024 * 1024;
const orderedNumbering = "assignment-ordered";

const infoHeading = "THÔNG TIN BÀI TẬP";
const writingHeading = "PHẦN VIẾT";
const sectionHeadings: Array<{ label: string; section: AssignmentSection }> = [
  { label: "PHẦN TỪ VỰNG", section: AssignmentSection.VOCABULARY },
  { label: "PHẦN NGỮ PHÁP", section: AssignmentSection.GRAMMAR },
  { label: "PHẦN ĐỌC HIỂU", section: AssignmentSection.READING },
];

// Nhãn loại câu hỏi giáo viên gõ trong ngoặc vuông. Loại cố định phần thì bỏ qua đầu mục đang đứng.
const fixedTypes: Record<string, AssignmentQuestionType> = {
  "TRẢ LỜI NGẮN": AssignmentQuestionType.READING_SHORT_ANSWER,
  "SỬA LỖI": AssignmentQuestionType.GRAMMAR_ERROR_CORRECTION,
  "SẮP XẾP CÂU": AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER,
  "NỐI CẶP": AssignmentQuestionType.VOCAB_MATCHING,
  "ĐÚNG/SAI": AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN,
};
const choiceBySection: Record<string, AssignmentQuestionType> = {
  VOCABULARY: AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE,
  GRAMMAR: AssignmentQuestionType.GRAMMAR_MULTIPLE_CHOICE,
  READING: AssignmentQuestionType.READING_MULTIPLE_CHOICE,
};
const blankBySection: Record<string, AssignmentQuestionType> = {
  VOCABULARY: AssignmentQuestionType.VOCAB_FILL_BLANK,
  GRAMMAR: AssignmentQuestionType.GRAMMAR_FILL_BLANK,
  READING: AssignmentQuestionType.READING_SHORT_ANSWER,
};
const labelByType = new Map<AssignmentQuestionType, string>([
  [AssignmentQuestionType.VOCAB_MULTIPLE_CHOICE, "Trắc nghiệm"], [AssignmentQuestionType.GRAMMAR_MULTIPLE_CHOICE, "Trắc nghiệm"], [AssignmentQuestionType.READING_MULTIPLE_CHOICE, "Trắc nghiệm"],
  [AssignmentQuestionType.VOCAB_FILL_BLANK, "Điền từ"], [AssignmentQuestionType.GRAMMAR_FILL_BLANK, "Điền từ"],
  [AssignmentQuestionType.READING_SHORT_ANSWER, "Trả lời ngắn"], [AssignmentQuestionType.GRAMMAR_ERROR_CORRECTION, "Sửa lỗi"],
  [AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER, "Sắp xếp câu"], [AssignmentQuestionType.VOCAB_MATCHING, "Nối cặp"],
  [AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN, "Đúng/Sai"],
]);
const assignmentTypes = new Set<string>(Object.values(AssignmentType));
const writingTypes = new Set<string>(Object.values(WritingTaskType));
const trueFalseWords: Record<string, string> = { "ĐÚNG": "TRUE", TRUE: "TRUE", "SAI": "FALSE", FALSE: "FALSE", "KHÔNG CÓ THÔNG TIN": "NOT_GIVEN", NOT_GIVEN: "NOT_GIVEN", NG: "NOT_GIVEN" };

const upper = (value: string) => value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("vi-VN");
const clean = (value: string) => value.replace(/\u00a0/gu, " ").replace(/\s+/gu, " ").trim();
const field = (line: string, name: string) => {
  const match = new RegExp(`^${name}\\s*:\\s*(.*)$`, "iu").exec(line.trim());
  return match ? match[1].trim() : null;
};

type DocLine = { text: string; heading: boolean };

function readLines(html: string): DocLine[] {
  const root = parse(html);
  const lines: DocLine[] = [];
  const walk = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (!(child instanceof HTMLElement)) continue;
      const tag = child.tagName?.toUpperCase() ?? "";
      if (tag === "UL" || tag === "OL" || tag === "TABLE" || tag === "TBODY" || tag === "TR" || tag === "DIV") { walk(child); continue; }
      if (tag === "TD" || tag === "TH") { const text = clean(child.textContent); if (text) lines.push({ text, heading: false }); continue; }
      const text = clean(child.textContent);
      if (text) lines.push({ text, heading: /^H[1-3]$/u.test(tag) });
    }
  };
  walk(root);
  return lines;
}

type Draft = { number: number; label: string; points: number; section: AssignmentSection; passageNumber: number | null; prompt: string[]; options: Array<{ id: string; text: string }>; pairs: Array<{ left: string; right: string }>; tokens: string[]; answer: string | null; explanation: string | null };

function buildQuestion(draft: Draft, warnings: string[]): DocumentQuestion | null {
  const label = upper(draft.label);
  const type = fixedTypes[label] ?? (label === "TRẮC NGHIỆM" ? choiceBySection[draft.section] : label === "ĐIỀN TỪ" ? blankBySection[draft.section] : null);
  if (!type) { warnings.push(`Câu ${draft.number}: không nhận ra loại “${draft.label}”, đã bỏ qua.`); return null; }
  const prompt = draft.prompt.join(" ").trim();
  if (!prompt) { warnings.push(`Câu ${draft.number}: thiếu nội dung câu hỏi, đã bỏ qua.`); return null; }
  const section = type === AssignmentQuestionType.VOCAB_MATCHING ? AssignmentSection.VOCABULARY
    : type === AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER || type === AssignmentQuestionType.GRAMMAR_ERROR_CORRECTION ? AssignmentSection.GRAMMAR
    : type === AssignmentQuestionType.READING_SHORT_ANSWER || type === AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN ? AssignmentSection.READING
    : draft.section;
  const answer = draft.answer?.trim() ?? "";
  const base = { type, section, prompt, explanation: draft.explanation, points: draft.points, passageNumber: section === AssignmentSection.READING ? draft.passageNumber : null };

  if (type === AssignmentQuestionType.VOCAB_MATCHING) {
    if (!draft.pairs.length) { warnings.push(`Câu ${draft.number}: chưa có cặp nối nào, đã bỏ qua.`); return null; }
    return { ...base, config: { pairs: draft.pairs.map((pair, index) => ({ leftId: `l${index + 1}`, leftText: pair.left, rightId: `r${index + 1}`, rightText: pair.right })) } };
  }
  if (type === AssignmentQuestionType.GRAMMAR_SENTENCE_ORDER) {
    if (draft.tokens.length < 2) { warnings.push(`Câu ${draft.number}: cần ít nhất hai thành phần để sắp xếp, đã bỏ qua.`); return null; }
    const tokens = draft.tokens.map((text, index) => ({ id: `t${index + 1}`, text }));
    const order = answer ? answer.split(/[-,\s]+/u).map((item) => Number(item.trim())) : tokens.map((_, index) => index + 1);
    if (order.length !== tokens.length || order.some((value) => !Number.isInteger(value) || value < 1 || value > tokens.length) || new Set(order).size !== order.length) {
      warnings.push(`Câu ${draft.number}: thứ tự đúng phải liệt kê đủ ${tokens.length} vị trí, đã bỏ qua.`); return null;
    }
    return { ...base, config: { tokens, correctOrder: order.map((value) => tokens[value - 1].id) } };
  }
  if (type === AssignmentQuestionType.READING_TRUE_FALSE_NOT_GIVEN) {
    const value = trueFalseWords[upper(answer)];
    if (!value) { warnings.push(`Câu ${draft.number}: đáp án phải là Đúng, Sai hoặc Không có thông tin, đã bỏ qua.`); return null; }
    return { ...base, config: { correctAnswer: value } };
  }
  if (type.endsWith("MULTIPLE_CHOICE")) {
    if (draft.options.length < 2) { warnings.push(`Câu ${draft.number}: câu trắc nghiệm cần ít nhất hai lựa chọn, đã bỏ qua.`); return null; }
    const correct = draft.options.find((option) => option.id === upper(answer)) ?? draft.options.find((option) => upper(option.text) === upper(answer));
    if (!correct) { warnings.push(`Câu ${draft.number}: không tìm thấy lựa chọn ứng với đáp án “${answer}”, đã bỏ qua.`); return null; }
    return { ...base, config: { options: draft.options, correctOptionId: correct.id } };
  }
  const accepted = answer.split("|").map((item) => item.trim()).filter(Boolean);
  if (!accepted.length) { warnings.push(`Câu ${draft.number}: thiếu dòng “Đáp án:”, đã bỏ qua.`); return null; }
  return { ...base, config: { acceptedAnswers: accepted } };
}

const questionStart = /^(\d+)\s*[.)]\s*\[([^\]]+)\]\s*(?:Điểm\s*:\s*([\d.,]+))?\s*(?:\(\s*đoạn\s*(\d+)\s*\))?\s*(.*)$/iu;
const optionStart = /^([A-H])\s*[.)]\s*(.+)$/u;
const passageStart = /^ĐOẠN ĐỌC\s*(\d+)?\s*[:.]?\s*(.*)$/iu;

function parseDocument(lines: DocLine[]): { data: DocumentAssignment; warnings: string[] } {
  const warnings: string[] = [];
  const questions: DocumentQuestion[] = [];
  const passages: DocumentPassage[] = [];
  let writing: DocumentWriting | null = null;
  const meta = { title: "", description: null as string | null, type: AssignmentType.HOMEWORK as AssignmentType, maxAttempts: null as number | null, timeLimitMinutes: null as number | null };
  let area: "none" | "info" | "questions" | "writing" = "none";
  let section: AssignmentSection = AssignmentSection.VOCABULARY;
  let passage: DocumentPassage | null = null;
  let draft: Draft | null = null;

  const closeDraft = () => { if (draft) { const built = buildQuestion(draft, warnings); if (built) questions.push(built); draft = null; } };

  for (const line of lines) {
    const text = line.text;
    const key = upper(text);
    if (line.heading || key === infoHeading || key === writingHeading || sectionHeadings.some((item) => item.label === key)) {
      const matchedSection = sectionHeadings.find((item) => item.label === key);
      if (key === infoHeading) { closeDraft(); area = "info"; passage = null; continue; }
      if (key === writingHeading) { closeDraft(); area = "writing"; passage = null; writing = { type: WritingTaskType.ESSAY, prompt: null, minWords: null, translationItems: [] }; continue; }
      if (matchedSection) { closeDraft(); area = "questions"; section = matchedSection.section; passage = null; continue; }
      if (line.heading) { warnings.push(`Bỏ qua tiêu đề không thuộc mẫu: ${text}.`); continue; }
    }

    if (area === "info") {
      const title = field(text, "Tiêu đề"); if (title !== null) { meta.title = title; continue; }
      const description = field(text, "Mô tả"); if (description !== null) { meta.description = description || null; continue; }
      const type = field(text, "Loại"); if (type !== null) { if (assignmentTypes.has(upper(type))) meta.type = upper(type) as AssignmentType; else if (type) warnings.push(`Loại bài tập “${type}” không hợp lệ, dùng mặc định HOMEWORK.`); continue; }
      const attempts = field(text, "Số lần làm"); if (attempts !== null) { const value = Number(attempts); meta.maxAttempts = Number.isInteger(value) && value >= 1 && value <= 20 ? value : null; continue; }
      const limit = field(text, "Thời gian \\(phút\\)") ?? field(text, "Thời gian"); if (limit !== null) { const value = Number(limit); meta.timeLimitMinutes = Number.isInteger(value) && value >= 1 && value <= 180 ? value : null; continue; }
      continue;
    }

    if (area === "writing" && writing) {
      const type = field(text, "Loại"); if (type !== null) { if (writingTypes.has(upper(type))) writing.type = upper(type) as WritingTaskType; continue; }
      const prompt = field(text, "Đề bài"); if (prompt !== null) { writing.prompt = prompt || null; continue; }
      const minWords = field(text, "Số từ tối thiểu"); if (minWords !== null) { const value = Number(minWords); writing.minWords = Number.isInteger(value) && value > 0 ? value : null; continue; }
      const item = /^\d+\s*[.)]\s*(.+)$/u.exec(text); if (item) { writing.translationItems.push(item[1].trim()); continue; }
      if (!writing.prompt) writing.prompt = text; else writing.prompt += `\n${text}`;
      continue;
    }

    if (area !== "questions") continue;

    const passageMatch: RegExpExecArray | null = section === AssignmentSection.READING && !draft ? passageStart.exec(text) : null;
    if (passageMatch) { closeDraft(); passage = { number: Number(passageMatch[1] ?? passages.length + 1), title: passageMatch[2].trim() || null, content: "" }; passages.push(passage); continue; }

    const start = questionStart.exec(text);
    if (start) {
      closeDraft();
      const points = Number(String(start[3] ?? "1").replace(",", "."));
      draft = { number: Number(start[1]), label: start[2].trim(), points: Number.isFinite(points) && points > 0 ? points : 1, section, passageNumber: start[4] ? Number(start[4]) : passage?.number ?? null, prompt: start[5].trim() ? [start[5].trim()] : [], options: [], pairs: [], tokens: [], answer: null, explanation: null };
      continue;
    }

    if (!draft) { if (passage) passage.content = passage.content ? `${passage.content}\n${text}` : text; continue; }

    const answer = field(text, "Đáp án"); if (answer !== null) { draft.answer = answer; continue; }
    const explanation = field(text, "Giải thích"); if (explanation !== null) { draft.explanation = explanation || null; continue; }
    const tokens = field(text, "Các thành phần"); if (tokens !== null) { draft.tokens = tokens.split("/").map((item) => item.trim()).filter(Boolean); continue; }
    const option = optionStart.exec(text); if (option) { draft.options.push({ id: option[1].toUpperCase(), text: option[2].trim() }); continue; }
    if (text.includes("=")) { const [left, ...rest] = text.split("="); const right = rest.join("=").trim(); if (left.trim() && right) { draft.pairs.push({ left: left.trim(), right }); continue; } }
    draft.prompt.push(text);
  }
  closeDraft();

  for (const question of questions) {
    if (question.passageNumber !== null && !passages.some((item) => item.number === question.passageNumber)) {
      warnings.push(`Câu hỏi tham chiếu đoạn đọc ${question.passageNumber} không tồn tại, đã bỏ liên kết.`);
      question.passageNumber = null;
    }
  }
  if (writing && writing.type !== WritingTaskType.ESSAY && !writing.translationItems.length) { warnings.push("Phần Viết dạng dịch chưa có câu nào, đã bỏ qua."); writing = null; }
  if (writing && writing.type === WritingTaskType.ESSAY && !writing.prompt?.trim()) { warnings.push("Phần Viết dạng Essay chưa có đề bài, đã bỏ qua."); writing = null; }

  return { data: { ...meta, questions, passages: passages.filter((item) => item.content.trim()), writing }, warnings };
}

const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 240, after: 110 }, children: [new TextRun({ text, bold: true, color: "000000", size: 26 })] });
const body = (text: string, options: { indent?: number; italics?: boolean; bold?: boolean; color?: string } = {}) =>
  new Paragraph({ spacing: { after: 70 }, ...(options.indent ? { indent: { left: options.indent } } : {}), children: [new TextRun({ text, color: options.color ?? "18233B", italics: options.italics, bold: options.bold, size: 22 })] });

function questionParagraphs(question: DocumentQuestion, number: number) {
  const config = question.config as { options?: Array<{ id: string; text: string }>; correctOptionId?: string; acceptedAnswers?: string[]; correctAnswer?: string; pairs?: Array<{ leftText: string; rightText: string }>; tokens?: Array<{ id: string; text: string }>; correctOrder?: string[] };
  const label = labelByType.get(question.type) ?? "Trắc nghiệm";
  const suffix = question.passageNumber ? ` (đoạn ${question.passageNumber})` : "";
  const out = [body(`${number}. [${label}] Điểm: ${question.points}${suffix}`, { bold: true }), body(question.prompt, { indent: 360 })];
  if (config.options?.length) {
    for (const option of config.options) out.push(body(`${option.id}. ${option.text}`, { indent: 720 }));
    out.push(body(`Đáp án: ${config.correctOptionId ?? ""}`, { indent: 360 }));
  } else if (config.pairs?.length) {
    for (const pair of config.pairs) out.push(body(`${pair.leftText} = ${pair.rightText}`, { indent: 720 }));
  } else if (config.tokens?.length) {
    out.push(body(`Các thành phần: ${config.tokens.map((token) => token.text).join(" / ")}`, { indent: 360 }));
    const order = (config.correctOrder ?? []).map((id) => config.tokens!.findIndex((token) => token.id === id) + 1);
    out.push(body(`Đáp án: ${order.join("-")}`, { indent: 360 }));
  } else if (config.correctAnswer) {
    out.push(body(`Đáp án: ${config.correctAnswer}`, { indent: 360 }));
  } else {
    out.push(body(`Đáp án: ${(config.acceptedAnswers ?? []).join(" | ")}`, { indent: 360 }));
  }
  if (question.explanation) out.push(body(`Giải thích: ${question.explanation}`, { indent: 360, italics: true, color: "5A6478" }));
  return out;
}

const templateGuide = [
  "Mỗi câu bắt đầu bằng: số thứ tự, loại câu trong ngoặc vuông, rồi Điểm.",
  "Loại hỗ trợ: Trắc nghiệm, Điền từ, Trả lời ngắn, Sửa lỗi, Sắp xếp câu, Nối cặp, Đúng/Sai.",
  "Đáp án luôn nằm ở dòng “Đáp án:” ngay dưới câu hỏi.",
  "Điền từ cho nhiều đáp án đúng bằng dấu gạch đứng: Đáp án: painting | a painting.",
  "Phần nghe và phần đọc thành tiếng cần file âm thanh nên vẫn soạn trên web.",
];

@Injectable()
export class AssignmentDocumentService {
  private async render(children: Paragraph[]) {
    const numbering = { config: [{ reference: orderedNumbering, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] };
    const document = new Document({ numbering, styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 276 } } } } }, sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children }] });
    return Buffer.from(await Packer.toBuffer(document));
  }

  createTemplate() {
    const children = [
      new Paragraph({ style: "Title", children: [new TextRun({ text: "Mẫu nhập bài tập Ms Ngân English", bold: true, color: "000000", size: 36 })] }),
      ...templateGuide.map((line) => body(`• ${line}`, { color: "647086" })),
      heading(infoHeading), body("Tiêu đề: "), body("Loại: HOMEWORK"), body("Mô tả: "), body("Số lần làm: 1"), body("Thời gian (phút): "),
      heading("PHẦN TỪ VỰNG"),
      body("1. [Trắc nghiệm] Điểm: 1", { bold: true }), body("Chọn từ khác loại.", { indent: 360 }), body("A. difficult", { indent: 720 }), body("B. easy", { indent: 720 }), body("C. activity", { indent: 720 }), body("D. fun", { indent: 720 }), body("Đáp án: C", { indent: 360 }), body("Giải thích: activity là danh từ.", { indent: 360, italics: true }),
      body("2. [Điền từ] Điểm: 1", { bold: true }), body("Sắp xếp các chữ cái thành từ: P-I-T-N-G-I-N-A", { indent: 360 }), body("Đáp án: painting", { indent: 360 }),
      body("3. [Nối cặp] Điểm: 2", { bold: true }), body("Nối từ với nghĩa tiếng Việt.", { indent: 360 }), body("do projects = làm các dự án", { indent: 720 }), body("play games = chơi trò chơi", { indent: 720 }),
      heading("PHẦN NGỮ PHÁP"),
      body("4. [Sắp xếp câu] Điểm: 2", { bold: true }), body("Sắp xếp thành câu hoàn chỉnh.", { indent: 360 }), body("Các thành phần: are / What / you / doing?", { indent: 360 }), body("Đáp án: 2-1-3-4", { indent: 360 }),
      body("5. [Sửa lỗi] Điểm: 1", { bold: true }), body("They haves different favourite activities.", { indent: 360 }), body("Đáp án: They have different favourite activities.", { indent: 360 }),
      heading("PHẦN ĐỌC HIỂU"),
      body("ĐOẠN ĐỌC 1: John's school day", { bold: true }), body("At school, there are many fun activities to enjoy.", { indent: 360 }),
      body("6. [Trắc nghiệm] Điểm: 1 (đoạn 1)", { bold: true }), body("What does John enjoy?", { indent: 360 }), body("A. Reading", { indent: 720 }), body("B. Swimming", { indent: 720 }), body("Đáp án: A", { indent: 360 }),
      body("7. [Đúng/Sai] Điểm: 1 (đoạn 1)", { bold: true }), body("John hates school activities.", { indent: 360 }), body("Đáp án: Sai", { indent: 360 }),
      heading(writingHeading), body("Loại: ESSAY"), body("Đề bài: Viết đoạn văn về hoạt động yêu thích ở trường."), body("Số từ tối thiểu: 80"),
    ];
    return this.render(children);
  }

  exportAssignment(data: DocumentAssignment) {
    const children: Paragraph[] = [
      new Paragraph({ style: "Title", children: [new TextRun({ text: `Bài tập ${data.title}`.trim(), bold: true, color: "000000", size: 36 })] }),
      body("Nội dung bài tập được xuất từ Ms Ngân English", { color: "647086" }),
      heading(infoHeading), body(`Tiêu đề: ${data.title}`), body(`Loại: ${data.type}`), body(`Mô tả: ${data.description ?? ""}`),
      body(`Số lần làm: ${data.maxAttempts ?? 1}`), body(`Thời gian (phút): ${data.timeLimitMinutes ?? ""}`),
    ];
    let number = 0;
    for (const item of sectionHeadings) {
      const sectionQuestions = data.questions.filter((question) => question.section === item.section);
      const sectionPassages = item.section === AssignmentSection.READING ? data.passages : [];
      if (!sectionQuestions.length && !sectionPassages.length) continue;
      children.push(heading(item.label));
      for (const entry of sectionPassages) {
        children.push(body(`ĐOẠN ĐỌC ${entry.number}: ${entry.title ?? ""}`.trim(), { bold: true }));
        for (const paragraph of entry.content.split(/\r?\n/u).filter((line) => line.trim())) children.push(body(paragraph, { indent: 360 }));
      }
      for (const question of sectionQuestions) { number += 1; children.push(...questionParagraphs(question, number)); }
    }
    if (data.writing) {
      children.push(heading(writingHeading), body(`Loại: ${data.writing.type}`));
      if (data.writing.prompt) children.push(body(`Đề bài: ${data.writing.prompt}`));
      if (data.writing.minWords) children.push(body(`Số từ tối thiểu: ${data.writing.minWords}`));
      data.writing.translationItems.forEach((item, index) => children.push(body(`${index + 1}. ${item}`, { indent: 360 })));
    }
    return this.render(children);
  }

  validateFile(file: UploadFile | undefined) {
    if (!file) throw new BadRequestException("Vui lòng chọn file Word cần import.");
    if (file.size > maxDocxBytes) throw new BadRequestException("File Word vượt quá giới hạn 5 MB.");
    if (extname(file.originalname).toLowerCase() !== ".docx") throw new BadRequestException("Chỉ hỗ trợ file Word định dạng .docx.");
    if (![docxMime, "application/octet-stream"].includes(file.mimetype)) throw new BadRequestException("Định dạng file Word không hợp lệ.");
    if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) throw new BadRequestException("File Word không hợp lệ hoặc đã bị hỏng.");
  }

  async parseImport(file: UploadFile | undefined): Promise<ImportPreview> {
    this.validateFile(file);
    let html: string;
    try {
      const result = await mammoth.convertToHtml({ buffer: file!.buffer }, { includeDefaultStyleMap: true });
      html = result.value;
    } catch {
      throw new BadRequestException("Không thể đọc file Word. Vui lòng dùng đúng file .docx theo mẫu.");
    }
    if (html.length > 400_000) throw new BadRequestException("Nội dung file Word quá lớn.");
    const { data, warnings } = parseDocument(readLines(html));
    if (!data.questions.length && !data.writing) throw new BadRequestException("Không tìm thấy câu hỏi nào theo mẫu. Vui lòng dùng file Word theo mẫu của hệ thống.");
    if (data.questions.length > 200) throw new BadRequestException("Một bài tập chỉ nhận tối đa 200 câu hỏi.");
    const totalPoints = data.questions.reduce((sum, question) => sum + question.points, 0);
    return { ...data, warnings, totalPoints };
  }
}

export { docxMime };
