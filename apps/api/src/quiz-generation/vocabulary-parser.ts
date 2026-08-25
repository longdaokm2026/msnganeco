import type { SourceLesson, VocabularyRecord } from "./quiz-generation.types";
import { parseVocabularyEntries } from "../../../shared/vocabulary-parser";

export function parseLessonVocabulary(lesson: SourceLesson): VocabularyRecord[] {
  return parseVocabularyEntries(lesson.vocabulary).map(({ word, meaning, example }) => ({ word, meaning, example, lessonId: lesson.id, lessonTitle: lesson.title }));
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
