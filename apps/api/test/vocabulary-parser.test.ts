import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseVocabularyEntries, parseVocabularyText } from "../../shared/vocabulary-parser";

describe("Shared lesson vocabulary parser", () => {
  test("parses pipe-separated vocabulary", () => {
    assert.deepEqual(parseVocabularyEntries("weather | thời tiết | The weather is nice."), [
      { kind: "entry", word: "weather", pronunciation: null, meaning: "thời tiết", phrase: null, example: "The weather is nice." },
    ]);
  });

  test("parses the extended word, pronunciation, meaning, phrase and example format", () => {
    assert.deepEqual(parseVocabularyEntries("weather | /ˈweð.ər/ | thời tiết | weather forecast | The weather is nice."), [
      { kind: "entry", word: "weather", pronunciation: "/ˈweð.ər/", meaning: "thời tiết", phrase: "weather forecast", example: "The weather is nice." },
    ]);
  });

  test("parses tab-separated vocabulary", () => {
    assert.deepEqual(parseVocabularyEntries("sunny\tcó nắng\tIt's sunny."), [
      { kind: "entry", word: "sunny", pronunciation: null, meaning: "có nắng", phrase: null, example: "It's sunny." },
    ]);
  });

  test("preserves empty optional fields in the extended tab-separated format", () => {
    assert.deepEqual(parseVocabularyEntries("rainy\t/ˈreɪ.ni/\tcó mưa\t\tIt is rainy."), [
      { kind: "entry", word: "rainy", pronunciation: "/ˈreɪ.ni/", meaning: "có mưa", phrase: null, example: "It is rainy." },
    ]);
  });

  test("accepts a missing optional example", () => {
    assert.deepEqual(parseVocabularyEntries("rainy | có mưa"), [
      { kind: "entry", word: "rainy", pronunciation: null, meaning: "có mưa", phrase: null, example: null },
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
      { kind: "entry", word: "bầu trời", pronunciation: null, meaning: "khoảng không phía trên", phrase: null, example: "Bầu trời hôm nay rất đẹp." },
    ]);
  });
});
