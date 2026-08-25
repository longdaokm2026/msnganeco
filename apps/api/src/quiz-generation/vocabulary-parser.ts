import type { SourceLesson, VocabularyRecord } from "./quiz-generation.types";

const clean = (value: string) => value.trim().replace(/^[\s*•\-\d.)]+/, "").trim();

function parts(line: string) {
  if (line.includes("|")) return line.split("|").map(clean);
  if (line.includes("\t")) return line.split("\t").map(clean);
  if (line.includes("=>")) return line.split("=>").map(clean);
  return [];
}

export function parseLessonVocabulary(lesson: SourceLesson): VocabularyRecord[] {
  return lesson.vocabulary.split(/\r?\n/).flatMap((line) => {
    const [word, meaning, ...exampleParts] = parts(line);
    if (!word || !meaning) return [];
    const example = exampleParts.join(" | ").trim();
    return [{ word, meaning, example: example || null, lessonId: lesson.id, lessonTitle: lesson.title }];
  });
}

export function uniqueVocabulary(lessons: SourceLesson[]) {
  const seen = new Set<string>();
  return lessons.flatMap(parseLessonVocabulary).filter((item) => {
    const key = `${item.word.toLocaleLowerCase("en")}\u0000${item.meaning.toLocaleLowerCase("vi")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

