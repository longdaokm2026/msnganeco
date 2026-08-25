import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseVocabularyEntries, parseVocabularyText } from "../../shared/vocabulary-parser";

describe("Shared lesson vocabulary parser", () => {
  test("parses pipe-separated vocabulary", () => {
    assert.deepEqual(parseVocabularyEntries("weather | thời tiết | The weather is nice."), [
      { kind: "entry", word: "weather", meaning: "thời tiết", example: "The weather is nice." },
    ]);
  });

  test("parses tab-separated vocabulary", () => {
    assert.deepEqual(parseVocabularyEntries("sunny\tcó nắng\tIt's sunny."), [
      { kind: "entry", word: "sunny", meaning: "có nắng", example: "It's sunny." },
    ]);
  });

  test("accepts a missing optional example", () => {
    assert.deepEqual(parseVocabularyEntries("rainy | có mưa"), [
      { kind: "entry", word: "rainy", meaning: "có mưa", example: null },
    ]);
  });

  test("keeps malformed non-empty lines as plain-text fallback", () => {
    assert.deepEqual(parseVocabularyText("Vocabulary note without separators\n | thiếu từ"), [
      { kind: "fallback", text: "Vocabulary note without separators" },
      { kind: "fallback", text: "| thiếu từ" },
    ]);
  });

  test("preserves Vietnamese Unicode and ignores empty lines", () => {
    assert.deepEqual(parseVocabularyEntries("\n  bầu trời | khoảng không phía trên | Bầu trời hôm nay rất đẹp.  \n"), [
      { kind: "entry", word: "bầu trời", meaning: "khoảng không phía trên", example: "Bầu trời hôm nay rất đẹp." },
    ]);
  });
});
