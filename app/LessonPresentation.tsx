"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { splitPresentationText } from "../apps/shared/lesson-presentation";
import { parseVocabularyText, type VocabularyLine } from "../apps/shared/vocabulary-parser";

export type PresentableLesson = {
  title: string;
  summary: string | null;
  mainContent: string | null;
  vocabulary: string | null;
  grammar: string | null;
  examples: string | null;
};

type TitleSlide = { kind: "title"; title: string };
type TextSlide = { kind: "text"; section: string; title: string; page: string | null; content: string };
type VocabularySlide = { kind: "vocabulary"; section: string; title: string; page: string | null; lines: VocabularyLine[] };
type LessonSlide = TitleSlide | TextSlide | VocabularySlide;
const vocabularyRowsPerSlide = 5;

const textSections: Array<{ key: keyof Pick<PresentableLesson, "summary" | "mainContent" | "grammar" | "examples">; title: string; section: string; maxBlocks?: number }> = [
  { key: "summary", title: "Tóm tắt / Mục tiêu", section: "Tóm tắt" },
  { key: "mainContent", title: "Nội dung chính", section: "Nội dung" },
  // Mỗi mục ngữ pháp có công thức và ví dụ đi kèm nên chỉ xếp tối đa hai mục một trang.
  { key: "grammar", title: "Ngữ pháp", section: "Ngữ pháp", maxBlocks: 2 },
  { key: "examples", title: "Ví dụ", section: "Ví dụ" },
];

export function buildLessonSlides(lesson: PresentableLesson): LessonSlide[] {
  const slides: LessonSlide[] = [{ kind: "title", title: lesson.title.trim() || "Bài học" }];
  for (const definition of textSections.slice(0, 2)) {
    const chunks = splitPresentationText(lesson[definition.key] ?? "", 680, definition.maxBlocks);
    chunks.forEach((content, index) => slides.push({
      kind: "text",
      section: definition.section,
      title: definition.title,
      page: chunks.length > 1 ? `${index + 1}/${chunks.length}` : null,
      content,
    }));
  }
  const vocabulary = parseVocabularyText(lesson.vocabulary ?? "");
  for (let index = 0; index < vocabulary.length; index += vocabularyRowsPerSlide) {
    const number = Math.floor(index / vocabularyRowsPerSlide) + 1;
    const pageCount = Math.ceil(vocabulary.length / vocabularyRowsPerSlide);
    slides.push({ kind: "vocabulary", section: "Từ vựng", title: "Từ vựng", page: pageCount > 1 ? `${number}/${pageCount}` : null, lines: vocabulary.slice(index, index + vocabularyRowsPerSlide) });
  }
  for (const definition of textSections.slice(2)) {
    const chunks = splitPresentationText(lesson[definition.key] ?? "", 680, definition.maxBlocks);
    chunks.forEach((content, index) => slides.push({
      kind: "text",
      section: definition.section,
      title: definition.title,
      page: chunks.length > 1 ? `${index + 1}/${chunks.length}` : null,
      content,
    }));
  }
  return slides;
}

const bulletMarker = /^[-•*]\s+/u;

function TextContent({ value }: { value: string }) {
  const lines = value.split(/\r?\n/u).filter((line) => line.trim());
  return <div className={`lesson-presentation-copy${lines.length > 8 ? " is-dense" : ""}`}>
    {lines.map((raw, index) => {
      const line = raw.trim();
      if (/^\s/u.test(raw)) return <p className="is-child" key={index}>{line}</p>;
      if (bulletMarker.test(line)) return <p className="is-bullet" key={index}>{line.replace(bulletMarker, "")}</p>;
      if (/^\d+[.)]\s+/u.test(line)) return <p className="is-lead" key={index}>{line}</p>;
      return <p key={index}>{line}</p>;
    })}
  </div>;
}

function VocabularyContent({ lines }: { lines: VocabularyLine[] }) {
  return <div className="lesson-presentation-vocabulary"><table><caption>Từ vựng của bài học</caption><colgroup><col className="vocabulary-word-column" /><col className="vocabulary-pronunciation-column" /><col className="vocabulary-meaning-column" /><col className="vocabulary-phrase-column" /><col className="vocabulary-example-column" /></colgroup><thead><tr><th scope="col">Từ</th><th scope="col">Phiên âm</th><th scope="col">Nghĩa</th><th scope="col">Cụm từ</th><th scope="col">Câu ví dụ</th></tr></thead><tbody>{lines.map((line, index) => line.kind === "entry" ? <tr key={`${line.word}-${index}`}><th scope="row">{line.word}</th><td>{line.pronunciation || "—"}</td><td>{line.meaning}</td><td>{line.phrase || "—"}</td><td><em>{line.example || "—"}</em></td></tr> : <tr key={`fallback-${index}`}><td colSpan={5}>{line.text}</td></tr>)}</tbody></table></div>;
}

export default function LessonPresentation({ lesson, onClose }: { lesson: PresentableLesson; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slides = useMemo(() => buildLessonSlides(lesson), [lesson]);
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const last = slides.length - 1;
  // Bài học có thể được cập nhật giữa lúc trình chiếu và làm số slide giảm đi,
  // nên vị trí hiển thị luôn được kẹp lại thay vì tin vào state cũ.
  const current = Math.min(active, Math.max(0, last));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); setActive((value) => Math.min(last, value + 1)); }
      else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); setActive((value) => Math.max(0, Math.min(value, last) - 1)); }
      else if (event.key === "Home") { event.preventDefault(); setActive(0); }
      else if (event.key === "End") { event.preventDefault(); setActive(last); }
      else if (event.key === "Escape" && !document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [last, onClose]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen();
  }

  return <div className="lesson-presentation" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Trình chiếu bài học ${lesson.title}`}>
    <header className="lesson-presentation-toolbar">
      <strong>Ms Ngân English</strong>
      <div>
        <button type="button" onClick={() => window.print()} aria-label="In hoặc lưu bài giảng thành PDF">In / Lưu PDF</button>
        <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}</button>
        <button type="button" className="lesson-presentation-close" onClick={onClose} aria-label="Đóng trình chiếu">Đóng ×</button>
      </div>
    </header>
    <main className="lesson-presentation-deck">
      {slides.map((slide, index) => <article className={`lesson-presentation-slide${index === current ? " is-active" : ""}${slide.kind === "title" ? " is-title" : ""}`} aria-hidden={index !== current} key={`${slide.kind}-${index}`}>
        {slide.kind === "title" ? <div className="lesson-presentation-title"><span>Bài học</span><h1>{slide.title}</h1><i aria-hidden="true" /></div> : <><header>{slide.page ? <span>Trang {slide.page}</span> : null}<h2>{slide.title}</h2></header>{slide.kind === "vocabulary" ? <VocabularyContent lines={slide.lines} /> : <TextContent value={slide.content} />}</>}
        <footer><span>Ms Ngân English</span><b>{index + 1}</b></footer>
      </article>)}
    </main>
    <nav className="lesson-presentation-controls" aria-label="Điều hướng trang trình chiếu">
      <button type="button" disabled={current === 0} onClick={() => setActive((value) => Math.max(0, value - 1))}>← Trang trước</button>
      <span aria-live="polite">{current + 1} / {slides.length}</span>
      <button type="button" disabled={current === last} onClick={() => setActive((value) => Math.min(last, value + 1))}>Trang sau →</button>
    </nav>
  </div>;
}
