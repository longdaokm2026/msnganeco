import { BadRequestException, Injectable } from "@nestjs/common";
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import mammoth from "mammoth";
import { HTMLElement, Node, parse } from "node-html-parser";
import { extname } from "node:path";
import type { LessonTextInput } from "./lesson.types";
import type { UploadFile } from "./storage/lesson-storage.service";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const maxDocxBytes = 5 * 1024 * 1024;
const vocabularyHeaders = ["Từ", "Phiên âm", "Nghĩa", "Cụm từ", "Câu ví dụ"];

type LessonDocumentKey = keyof Required<LessonTextInput>;
type LessonDocumentData = Required<Pick<LessonTextInput, LessonDocumentKey>>;

const sections: Array<{ key: LessonDocumentKey; label: string; limit: number; placeholder: string }> = [
  { key: "title", label: "TIÊU ĐỀ BÀI HỌC", limit: 200, placeholder: "Nhập tiêu đề bài học" },
  { key: "summary", label: "TÓM TẮT / MỤC TIÊU", limit: 5000, placeholder: "Nhập tóm tắt hoặc mục tiêu bài học" },
  { key: "mainContent", label: "NỘI DUNG CHÍNH", limit: 50000, placeholder: "Nhập nội dung chính" },
  { key: "theory", label: "LÝ THUYẾT", limit: 30000, placeholder: "Nhập nội dung lý thuyết" },
  { key: "vocabulary", label: "TỪ VỰNG", limit: 30000, placeholder: "" },
  { key: "grammar", label: "NGỮ PHÁP", limit: 30000, placeholder: "Nhập nội dung ngữ pháp" },
  { key: "examples", label: "VÍ DỤ", limit: 30000, placeholder: "Nhập ví dụ" },
  { key: "reviewNotes", label: "NỘI DUNG CẦN ÔN", limit: 30000, placeholder: "Nhập nội dung cần ôn" },
  { key: "homeworkNotes", label: "BÀI TẬP / CHUẨN BỊ BUỔI SAU", limit: 30000, placeholder: "Nhập bài tập hoặc nội dung chuẩn bị cho buổi sau" },
];

const normalizeHeading = (value: string) => value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("vi-VN");
const sectionByHeading = new Map(sections.map((item) => [normalizeHeading(item.label), item]));
const placeholders = new Set(sections.map((item) => item.placeholder).filter(Boolean).map(normalizeHeading));
const cleanText = (value: string) => value.replace(/\u00a0/gu, " ").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();

function textFromBlock(node: Node) {
  if (!(node instanceof HTMLElement)) return cleanText(node.textContent);
  const tag = node.tagName.toUpperCase();
  if (tag === "UL") return node.querySelectorAll("li").map((item) => `- ${cleanText(item.textContent)}`).join("\n");
  if (tag === "OL") return node.querySelectorAll("li").map((item, index) => `${index + 1}. ${cleanText(item.textContent)}`).join("\n");
  if (tag === "TABLE") return node.querySelectorAll("tr").map((row) => row.querySelectorAll("th,td").map((cell) => cleanText(cell.textContent)).join(" | ")).join("\n");
  return cleanText(node.textContent);
}

function parseVocabulary(nodes: Node[]) {
  const table = nodes.find((node) => node instanceof HTMLElement && node.tagName.toUpperCase() === "TABLE") as HTMLElement | undefined;
  if (!table) return cleanText(nodes.map(textFromBlock).filter(Boolean).join("\n"));
  return table.querySelectorAll("tr").flatMap((row, rowIndex) => {
    const cells = row.querySelectorAll("th,td").map((cell) => cleanText(cell.textContent));
    if (!cells.some(Boolean)) return [];
    const normalized = cells.map(normalizeHeading);
    if (rowIndex === 0 && normalized[0] === normalizeHeading(vocabularyHeaders[0]) && normalized[2] === normalizeHeading(vocabularyHeaders[2])) return [];
    return [[...cells.slice(0, 5), ...Array(Math.max(0, 5 - cells.length)).fill("")].slice(0, 5).join(" | ")];
  }).join("\n");
}

function sectionParagraph(text: string, placeholder: string) {
  const value = text.trim();
  return new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: value || placeholder, color: value ? "18233B" : "8A91A2", italics: !value, size: 22 })] });
}

function vocabularyTable(value: string) {
  const rows = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.includes("|") ? line.split("|").map((part) => part.trim()) : [line];
    return [...parts.slice(0, 5), ...Array(Math.max(0, 5 - parts.length)).fill("")].slice(0, 5);
  });
  if (!rows.length) rows.push(["", "", "", "", ""]);
  const borders = { top: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }, left: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }, right: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }, insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" } };
  const cell = (text: string, header = false) => new TableCell({ shading: header ? { type: ShadingType.CLEAR, fill: "303B77", color: "auto" } : undefined, margins: { top: 100, bottom: 100, left: 110, right: 110 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text, bold: header, color: header ? "FFFFFF" : "18233B", size: header ? 19 : 20 })] })] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, borders, rows: [new TableRow({ tableHeader: true, children: vocabularyHeaders.map((item) => cell(item, true)) }), ...rows.map((row) => new TableRow({ children: row.map((item) => cell(item)) }))] });
}

@Injectable()
export class LessonDocumentService {
  private async createDocument(data?: Partial<LessonDocumentData>) {
    const children: Array<Paragraph | Table> = [
      new Paragraph({ style: "Title", children: [new TextRun({ text: data ? `Bài học ${data.title || ""}`.trim() : "Mẫu nhập bài học Ms Ngân English", bold: true, color: "000000", size: 36 })] }),
      new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: data ? "Nội dung bài học được xuất từ Ms Ngân English" : "Điền nội dung dưới từng tiêu đề. Không đổi tên hoặc thứ tự các tiêu đề. Phần từ vựng sử dụng bảng 5 cột có sẵn.", color: "647086", size: 20 })] }),
    ];
    for (const section of sections) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 220, after: 100 }, children: [new TextRun({ text: section.label, bold: true, color: "000000", size: 26 })] }));
      if (section.key === "vocabulary") children.push(vocabularyTable(String(data?.vocabulary ?? "")));
      else children.push(sectionParagraph(String(data?.[section.key] ?? ""), section.placeholder));
    }
    const document = new Document({ styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 276 } } } } }, sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children }] });
    return Buffer.from(await Packer.toBuffer(document));
  }

  createTemplate() { return this.createDocument(); }
  exportLesson(data: Partial<LessonDocumentData>) { return this.createDocument(data); }

  validateFile(file: UploadFile | undefined) {
    if (!file) throw new BadRequestException("Vui lòng chọn file Word cần import.");
    if (file.size > maxDocxBytes) throw new BadRequestException("File Word vượt quá giới hạn 5 MB.");
    if (extname(file.originalname).toLowerCase() !== ".docx") throw new BadRequestException("Chỉ hỗ trợ file Word định dạng .docx.");
    if (![docxMime, "application/octet-stream"].includes(file.mimetype)) throw new BadRequestException("Định dạng file Word không hợp lệ.");
    if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) throw new BadRequestException("File Word không hợp lệ hoặc đã bị hỏng.");
  }

  async parseImport(file: UploadFile | undefined) {
    this.validateFile(file);
    let html: string;
    let messages: Array<{ type: string; message: string }> = [];
    try {
      const result = await mammoth.convertToHtml({ buffer: file!.buffer }, { includeDefaultStyleMap: true });
      html = result.value;
      messages = result.messages.map((item) => ({ type: item.type, message: item.message }));
    } catch {
      throw new BadRequestException("Không thể đọc file Word. Vui lòng dùng đúng file .docx theo mẫu.");
    }
    if (html.length > 250_000) throw new BadRequestException("Nội dung file Word quá lớn.");
    const root = parse(html);
    const fields: Partial<LessonTextInput> = {};
    const foundSections: string[] = [];
    const unknownHeadings: string[] = [];
    const headings = root.querySelectorAll("h1,h2,h3");
    for (const heading of headings) {
      const definition = sectionByHeading.get(normalizeHeading(heading.textContent));
      if (!definition) { unknownHeadings.push(cleanText(heading.textContent)); continue; }
      const nodes: Node[] = [];
      const siblings = heading.parentNode?.childNodes ?? [];
      const headingIndex = siblings.indexOf(heading);
      for (let index = headingIndex + 1; index < siblings.length; index += 1) {
        const node = siblings[index];
        if (node instanceof HTMLElement && /^H[1-3]$/u.test(node.tagName.toUpperCase())) break;
        nodes.push(node);
      }
      let value = definition.key === "vocabulary" ? parseVocabulary(nodes) : cleanText(nodes.map(textFromBlock).filter(Boolean).join("\n\n"));
      if (placeholders.has(normalizeHeading(value))) value = "";
      if (value.length > definition.limit) throw new BadRequestException(`Mục “${definition.label}” vượt quá giới hạn ${definition.limit.toLocaleString("vi-VN")} ký tự.`);
      if (value) fields[definition.key] = value;
      foundSections.push(definition.label);
    }
    if (!foundSections.length) throw new BadRequestException("Không tìm thấy các đầu mục bài học. Vui lòng sử dụng file Word theo mẫu của hệ thống.");
    const missingSections = sections.filter((item) => !foundSections.includes(item.label)).map((item) => item.label);
    const vocabularyCount = String(fields.vocabulary ?? "").split(/\r?\n/u).filter((line) => line.trim()).length;
    const warnings = [
      ...(missingSections.length ? [`Thiếu ${missingSections.length} đầu mục; dữ liệu hiện có ở các mục này sẽ được giữ nguyên.`] : []),
      ...(unknownHeadings.length ? [`Bỏ qua tiêu đề không thuộc mẫu: ${unknownHeadings.join(", ")}.`] : []),
      ...(messages.some((item) => /image/iu.test(item.message)) || root.querySelectorAll("img").length ? ["Hình ảnh trong file Word đã được bỏ qua."] : []),
    ];
    return { fields, foundSections, missingSections, warnings, vocabularyCount };
  }
}

export { docxMime };
