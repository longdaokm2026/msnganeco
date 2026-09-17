export const continuationIndent = "   ";

// Một khối là dòng dẫn cộng các dòng con thụt lề của nó, ví dụ một mục ngữ pháp
// gồm tên thì, công thức, cách dùng và ví dụ. Khối không bao giờ bị tách sang hai trang.
export type PresentationBlock = { lead: string; children: string[] };

function splitLongBlock(value: string, limit: number) {
  const words = value.split(/\s+/u);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > limit) { chunks.push(current); current = word; }
    else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function groupBlocks(value: string) {
  const blocks: PresentationBlock[] = [];
  for (const raw of value.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\s/u.test(raw) && blocks.length) blocks[blocks.length - 1].children.push(line);
    else blocks.push({ lead: line, children: [] });
  }
  return blocks;
}

export const blockText = (block: PresentationBlock) => [block.lead, ...block.children.map((item) => `${continuationIndent}${item}`)].join("\n");

export function splitPresentationText(value: string, limit = 680, maxBlocks = 7) {
  const pages: string[] = [];
  let page: PresentationBlock[] = [];
  const flush = () => { if (page.length) { pages.push(page.map(blockText).join("\n")); page = []; } };
  for (const block of groupBlocks(value)) {
    const text = blockText(block);
    // Đoạn văn dài không có dòng con vẫn được cắt nhỏ; khối có dòng con thì giữ nguyên vẹn.
    if (!block.children.length && text.length > limit) {
      flush();
      for (const chunk of splitLongBlock(block.lead, limit)) pages.push(chunk);
      continue;
    }
    const length = page.reduce((sum, item) => sum + blockText(item).length + 1, 0) + text.length;
    if (page.length && (length > limit || page.length >= maxBlocks)) flush();
    page.push(block);
  }
  flush();
  return pages;
}

export type LessonLine = { kind: "lead" | "child" | "bullet" | "plain"; text: string };

const bulletMarker = /^[-•*]\s+/u;

// Dùng chung cho trình chiếu và màn xem bài của học sinh để hai nơi hiển thị giống nhau.
export function classifyLines(value: string): LessonLine[] {
  return value.split(/\r?\n/u).flatMap<LessonLine>((raw) => {
    const text = raw.trim();
    if (!text) return [];
    if (/^\s/u.test(raw)) return [{ kind: "child", text }];
    if (bulletMarker.test(text)) return [{ kind: "bullet", text: text.replace(bulletMarker, "") }];
    if (/^\d+[.)]\s+/u.test(text)) return [{ kind: "lead", text }];
    return [{ kind: "plain", text }];
  });
}
