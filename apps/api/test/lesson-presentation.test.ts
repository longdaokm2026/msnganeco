import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupBlocks, splitPresentationText } from "../../shared/lesson-presentation";

const grammar = [
  "1. Present Continuous",
  "   S + am/is/are + V-ing",
  "   Dùng cho kế hoạch đã được quyết định.",
  "2. Be going to",
  "   S + am/is/are going to + V",
  "   Dùng cho dự đoán có bằng chứng.",
  "3. Will",
  "   S + will + V",
  "   Dùng cho quyết định tức thời.",
].join("\n");

const leadsOf = (page: string) => page.split("\n").filter((line) => /^\d+[.)] /u.test(line));

describe("Lesson presentation layout", () => {
  test("gom dòng con vào đúng mục dẫn của nó", () => {
    const blocks = groupBlocks(grammar);

    assert.equal(blocks.length, 3);
    assert.deepEqual(blocks[0], { lead: "1. Present Continuous", children: ["S + am/is/are + V-ing", "Dùng cho kế hoạch đã được quyết định."] });
    assert.equal(blocks[2].children.length, 2);
  });

  test("không bao giờ tách một mục ngữ pháp sang hai trang", () => {
    const pages = splitPresentationText(grammar, 680, 2);

    for (const page of pages) {
      assert.match(page.split("\n")[0], /^\d+[.)] /u, `trang mở đầu giữa chừng: ${JSON.stringify(page.slice(0, 40))}`);
    }
    // Mỗi mục xuất hiện đúng một lần, kèm đủ hai dòng con của nó.
    assert.equal(pages.flatMap(leadsOf).length, 3);
    for (const page of pages) assert.equal(page.split("\n").length, leadsOf(page).length * 3);
  });

  test("xếp tối đa hai mục ngữ pháp trên một trang", () => {
    const pages = splitPresentationText(grammar, 680, 2);

    assert.equal(pages.length, 2);
    assert.deepEqual(leadsOf(pages[0]), ["1. Present Continuous", "2. Be going to"]);
    assert.deepEqual(leadsOf(pages[1]), ["3. Will"]);
  });

  test("giữ thụt lề của dòng con để trình chiếu hiển thị phân cấp", () => {
    const [first] = splitPresentationText(grammar, 680, 2);

    assert.match(first, /\n {3}S \+ am\/is\/are \+ V-ing/u);
  });

  test("vẫn cắt nhỏ đoạn văn dài không có dòng con", () => {
    const pages = splitPresentationText("từ ".repeat(400).trim(), 200);

    assert.ok(pages.length > 1);
    for (const page of pages) assert.ok(page.length <= 200, `trang dài ${page.length} ký tự`);
  });

  test("xếp bảy gạch đầu dòng mỗi trang khi không giới hạn riêng", () => {
    const pages = splitPresentationText(Array.from({ length: 10 }, (_, index) => `- Ý số ${index + 1}`).join("\n"));

    assert.equal(pages.length, 2);
    assert.equal(pages[0].split("\n").length, 7);
    assert.equal(pages[1].split("\n").length, 3);
  });
});
