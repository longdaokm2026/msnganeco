export type VocabularyEntry = {
  kind: "entry";
  word: string;
  meaning: string;
  example: string | null;
};

export type VocabularyFallback = {
  kind: "fallback";
  text: string;
};

export type VocabularyLine = VocabularyEntry | VocabularyFallback;

const cleanPart = (value: string) => value.trim().replace(/^(?:[*•-]|\d+[.)])\s+/u, "").trim();

function splitLine(line: string) {
  if (line.includes("|")) return { parts: line.split("|").map(cleanPart), joiner: " | " };
  if (line.includes("\t")) return { parts: line.split(/\t+/u).map(cleanPart), joiner: " " };
  // Keep the established Quick Quiz format for existing lesson data.
  if (line.includes("=>")) return { parts: line.split("=>").map(cleanPart), joiner: " => " };
  return null;
}

export function parseVocabularyText(value: string): VocabularyLine[] {
  return value.split(/\r?\n/u).flatMap<VocabularyLine>((rawLine) => {
    const text = rawLine.trim();
    if (!text) return [];
    const split = splitLine(text);
    if (!split) return [{ kind: "fallback" as const, text }];
    const [word, meaning, ...exampleParts] = split.parts;
    if (!word || !meaning) return [{ kind: "fallback" as const, text }];
    const example = exampleParts.join(split.joiner).trim();
    return [{ kind: "entry" as const, word, meaning, example: example || null }];
  });
}

export function parseVocabularyEntries(value: string): VocabularyEntry[] {
  return parseVocabularyText(value).filter((line): line is VocabularyEntry => line.kind === "entry");
}
