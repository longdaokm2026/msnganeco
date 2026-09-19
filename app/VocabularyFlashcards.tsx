"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildFlashcards, countFlashcardWords, flashcardLimits, seededRandom } from "../apps/shared/vocabulary-flashcards";

const limitLabel = (limit: number | null) => limit === null ? "Tất cả" : `${limit} từ`;

export default function VocabularyFlashcards({ title, vocabulary, onClose }: { title: string; vocabulary: string; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const total = useMemo(() => countFlashcardWords(vocabulary), [vocabulary]);
  const [limit, setLimit] = useState<number | null>(total > 20 ? 20 : null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const cards = useMemo(() => buildFlashcards(vocabulary, limit, seededRandom(seed)), [vocabulary, limit, seed]);
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const last = cards.length - 1;
  const current = Math.min(active, Math.max(0, last));
  const card = cards[current];

  const go = useCallback((step: number) => { setActive((value) => Math.max(0, Math.min(last, Math.min(value, last) + step))); setRevealed(false); }, [last]);
  const advance = useCallback(() => { setRevealed((value) => { if (!value) return true; go(1); return false; }); }, [go]);
  const reshuffle = useCallback(() => { setSeed(Math.floor(Math.random() * 2 ** 31)); setActive(0); setRevealed(false); }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") { event.preventDefault(); advance(); }
      else if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); go(1); }
      else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); go(-1); }
      else if (event.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [advance, go, onClose]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen();
  }

  return <div className="vocabulary-flashcards" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Kiểm tra từ vựng ${title}`}>
    <header className="flashcard-toolbar">
      <div><strong>Kiểm tra từ vựng</strong><small>{title}</small></div>
      <div className="flashcard-tools">
        <div className="flashcard-limits" role="group" aria-label="Số từ mỗi lượt">
          {flashcardLimits.filter((item) => item === null || item < total).map((item) => (
            <button type="button" key={String(item)} className={limit === item ? "is-active" : ""} onClick={() => { setLimit(item); setActive(0); setRevealed(false); }}>{limitLabel(item)}</button>
          ))}
        </div>
        <button type="button" onClick={reshuffle}>Xáo lại</button>
        <button type="button" onClick={() => void toggleFullscreen()}>Toàn màn hình</button>
        <button type="button" className="flashcard-close" onClick={onClose} aria-label="Đóng kiểm tra từ vựng">Đóng ×</button>
      </div>
    </header>

    <main className="flashcard-stage">
      {card ? <button type="button" className={`flashcard${revealed ? " is-revealed" : ""}`} onClick={advance} aria-live="polite">
        <span className="flashcard-meta"><b>{current + 1}/{cards.length}</b><em>{card.direction === "EN_TO_VI" ? "Anh → Việt" : "Việt → Anh"}</em></span>
        <strong className="flashcard-front">{card.front}</strong>
        {card.frontHint && <span className="flashcard-hint">{card.frontHint}</span>}
        {revealed ? <>
          <span className="flashcard-divider" aria-hidden="true" />
          <strong className="flashcard-back">{card.back}</strong>
          {card.backHint && <span className="flashcard-hint">{card.backHint}</span>}
          {card.example && <em className="flashcard-example">{card.example}</em>}
        </> : <span className="flashcard-prompt">Bấm để xem đáp án</span>}
      </button> : <p className="flashcard-empty">Bài học này chưa có từ vựng theo định dạng <b>từ | phiên âm | nghĩa</b>.</p>}
    </main>

    <nav className="flashcard-controls" aria-label="Điều hướng thẻ từ vựng">
      <button type="button" disabled={current === 0} onClick={() => go(-1)}>← Từ trước</button>
      <span aria-live="polite">{cards.length ? `${current + 1} / ${cards.length}` : "0 / 0"}</span>
      <button type="button" disabled={current >= last} onClick={() => go(1)}>Từ sau →</button>
    </nav>
  </div>;
}
