import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildFlashcards, countFlashcardWords, seededRandom } from "../../shared/vocabulary-flashcards";

const vocabulary = [
  "enjoy | /ɪnˈdʒɔɪ/ | thích thú | enjoy reading | I enjoy reading books.",
  "harvest | /ˈhɑːvɪst/ | thu hoạch | harvest crops | Farmers harvest the crops.",
  "recycle | /ˌriːˈsaɪkl/ | tái chế | recycle plastic | We should recycle more.",
  "solar | /ˈsəʊlə/ | thuộc năng lượng mặt trời | solar power | Solar energy is clean.",
].join("\n");

describe("Vocabulary flashcards", () => {
  test("phủ hết từ của buổi học, mỗi từ đúng một thẻ", () => {
    const cards = buildFlashcards(vocabulary, null, seededRandom(7));

    assert.equal(cards.length, 4);
    const words = cards.map((card) => card.direction === "EN_TO_VI" ? card.front : card.back);
    assert.deepEqual([...words].sort(), ["enjoy", "harvest", "recycle", "solar"]);
  });

  test("giới hạn số từ mỗi lượt", () => {
    assert.equal(buildFlashcards(vocabulary, 2, seededRandom(7)).length, 2);
    assert.equal(buildFlashcards(vocabulary, 10, seededRandom(7)).length, 4);
  });

  test("cùng hạt cho lại đúng bộ thẻ, khác hạt cho bộ khác", () => {
    const first = buildFlashcards(vocabulary, null, seededRandom(42));

    assert.deepEqual(buildFlashcards(vocabulary, null, seededRandom(42)), first);
    const other = buildFlashcards(vocabulary, null, seededRandom(43));
    assert.notDeepEqual(other.map((card) => card.front), first.map((card) => card.front));
  });

  test("bốc cả hai chiều hỏi chứ không cố định một chiều", () => {
    const directions = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) for (const card of buildFlashcards(vocabulary, null, seededRandom(seed))) directions.add(card.direction);

    assert.deepEqual([...directions].sort(), ["EN_TO_VI", "VI_TO_EN"]);
  });

  test("đặt phiên âm về đúng mặt thẻ theo chiều hỏi", () => {
    for (const card of buildFlashcards(vocabulary, null, seededRandom(5))) {
      if (card.direction === "EN_TO_VI") { assert.match(card.frontHint ?? "", /^\//u); assert.equal(card.backHint, null); }
      else { assert.equal(card.frontHint, null); assert.match(card.backHint ?? "", /^\//u); }
    }
  });

  test("bỏ qua dòng không đúng định dạng", () => {
    const messy = `${vocabulary}\nmột dòng ghi chú không có dấu gạch đứng\n| | |`;

    assert.equal(countFlashcardWords(messy), 4);
    assert.equal(buildFlashcards(messy, null, seededRandom(1)).length, 4);
  });

  test("bài học chưa có từ vựng thì không dựng thẻ nào", () => {
    assert.equal(countFlashcardWords(""), 0);
    assert.deepEqual(buildFlashcards("", null, seededRandom(1)), []);
  });
});
