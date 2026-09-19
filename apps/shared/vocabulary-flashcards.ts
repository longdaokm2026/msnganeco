import { parseVocabularyEntries, type VocabularyEntry } from "./vocabulary-parser";

export type FlashcardDirection = "EN_TO_VI" | "VI_TO_EN";
export type Flashcard = {
  key: string;
  direction: FlashcardDirection;
  front: string;
  frontHint: string | null;
  back: string;
  backHint: string | null;
  example: string | null;
};

export const flashcardLimits = [10, 20, null] as const;

// Bộ sinh ngẫu nhiên có gieo hạt: cùng một hạt cho lại đúng bộ thẻ đó, nên lượt
// xáo tái lập được và test không phải phụ thuộc vào Math.random.
export function seededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Ngẫu nhiên hai tầng: xáo thứ tự từ, rồi bốc chiều hỏi cho từng thẻ. Nếu chỉ xáo
// thứ tự mà giữ nguyên chiều thì học sinh vẫn đoán trước được sẽ bị hỏi gì.
function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const toCard = (entry: VocabularyEntry, index: number, direction: FlashcardDirection): Flashcard =>
  direction === "EN_TO_VI"
    ? { key: `${entry.word}-${index}`, direction, front: entry.word, frontHint: entry.pronunciation, back: entry.meaning, backHint: null, example: entry.example }
    : { key: `${entry.word}-${index}`, direction, front: entry.meaning, frontHint: null, back: entry.word, backHint: entry.pronunciation, example: entry.example };

export function buildFlashcards(vocabulary: string, limit: number | null = null, random: () => number = Math.random): Flashcard[] {
  const entries = parseVocabularyEntries(vocabulary).filter((entry) => entry.word.trim() && entry.meaning.trim());
  const picked = shuffle(entries, random).slice(0, limit ?? entries.length);
  return picked.map((entry, index) => toCard(entry, index, random() < 0.5 ? "EN_TO_VI" : "VI_TO_EN"));
}

export function countFlashcardWords(vocabulary: string) {
  return parseVocabularyEntries(vocabulary).filter((entry) => entry.word.trim() && entry.meaning.trim()).length;
}
