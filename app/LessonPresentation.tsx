"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
type TextSlide = { kind: "text"; section: string; title: string; content: string };
type VocabularySlide = { kind: "vocabulary"; section: string; title: string; lines: VocabularyLine[] };
type LessonSlide = TitleSlide | TextSlide | VocabularySlide;
const vocabularyRowsPerSlide = 5;

const textSections: Array<{ key: keyof Pick<PresentableLesson, "summary" | "mainContent" | "grammar" | "examples">; title: string; section: string }> = [
  { key: "summary", title: "Tóm tắt / Mục tiêu", section: "Tóm tắt" },
  { key: "mainContent", title: "Nội dung chính", section: "Nội dung" },
  { key: "grammar", title: "Ngữ pháp", section: "Ngữ pháp" },
  { key: "examples", title: "Ví dụ", section: "Ví dụ" },
];

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

export function splitPresentationText(value: string, limit = 680) {
  const blocks = value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).flatMap((item) => item.length > limit ? splitLongBlock(item, limit) : [item]);
  const pages: string[] = [];
  let page: string[] = [];
  for (const block of blocks) {
    const next = [...page, block].join("\n\n");
    if (page.length && (next.length > limit || page.length >= 7)) { pages.push(page.join("\n\n")); page = [block]; }
    else page.push(block);
  }
  if (page.length) pages.push(page.join("\n\n"));
  return pages;
}

export function buildLessonSlides(lesson: PresentableLesson): LessonSlide[] {
  const slides: LessonSlide[] = [{ kind: "title", title: lesson.title.trim() || "Bài học" }];
  for (const definition of textSections.slice(0, 2)) {
    const chunks = splitPresentationText(lesson[definition.key] ?? "");
    chunks.forEach((content, index) => slides.push({
      kind: "text",
      section: definition.section,
      title: chunks.length > 1 ? `${definition.title} · ${index + 1}/${chunks.length}` : definition.title,
      content,
    }));
  }
  const vocabulary = parseVocabularyText(lesson.vocabulary ?? "");
  for (let index = 0; index < vocabulary.length; index += vocabularyRowsPerSlide) {
    const number = Math.floor(index / vocabularyRowsPerSlide) + 1;
    const pageCount = Math.ceil(vocabulary.length / vocabularyRowsPerSlide);
    slides.push({ kind: "vocabulary", section: "Từ vựng", title: pageCount > 1 ? `Từ vựng · ${number}/${pageCount}` : "Từ vựng", lines: vocabulary.slice(index, index + vocabularyRowsPerSlide) });
  }
  for (const definition of textSections.slice(2)) {
    const chunks = splitPresentationText(lesson[definition.key] ?? "");
    chunks.forEach((content, index) => slides.push({
      kind: "text",
      section: definition.section,
      title: chunks.length > 1 ? `${definition.title} · ${index + 1}/${chunks.length}` : definition.title,
      content,
    }));
  }
  return slides;
}

function TextContent({ value }: { value: string }) {
  return <div className="lesson-presentation-copy">{value.split(/\n{2,}/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); setActive((value) => Math.min(last, value + 1)); }
      else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
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
      {slides.map((slide, index) => <article className={`lesson-presentation-slide${index === active ? " is-active" : ""}${slide.kind === "title" ? " is-title" : ""}`} aria-hidden={index !== active} key={`${slide.kind}-${index}`}>
        {slide.kind === "title" ? <div className="lesson-presentation-title"><span>Bài học</span><h1>{slide.title}</h1><i aria-hidden="true" /></div> : <><header><span>{slide.section}</span><h2>{slide.title}</h2></header>{slide.kind === "vocabulary" ? <VocabularyContent lines={slide.lines} /> : <TextContent value={slide.content} />}</>}
        <footer><span>Ms Ngân English</span><b>{index + 1}</b></footer>
      </article>)}
    </main>
    <nav className="lesson-presentation-controls" aria-label="Điều hướng trang trình chiếu">
      <button type="button" disabled={active === 0} onClick={() => setActive((value) => Math.max(0, value - 1))}>← Trang trước</button>
      <span aria-live="polite">{active + 1} / {slides.length}</span>
      <button type="button" disabled={active === last} onClick={() => setActive((value) => Math.min(last, value + 1))}>Trang sau →</button>
    </nav>
  </div>;
}
