import { parseVocabularyText } from "../apps/shared/vocabulary-parser";

export default function VocabularyViewer({ value }: { value: string }) {
  const lines = parseVocabularyText(value);
  if (!lines.length) return null;

  return <div className="vocabulary-viewer">
    <div className="vocabulary-table-wrap">
      <table className="vocabulary-table">
        <caption>Danh sách từ vựng trong bài học</caption>
        <thead><tr><th scope="col">Từ</th><th scope="col">Nghĩa</th><th scope="col">Ví dụ</th></tr></thead>
        <tbody>{lines.map((line, index) => line.kind === "entry" ? <tr key={`${line.word}-${index}`}><th scope="row">{line.word}</th><td>{line.meaning}</td><td className="vocabulary-example">{line.example || <span aria-label="Không có ví dụ">—</span>}</td></tr> : <tr className="vocabulary-fallback" key={`fallback-${index}`}><td colSpan={3}>{line.text}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="vocabulary-cards" aria-label="Danh sách từ vựng trong bài học">
      {lines.map((line, index) => line.kind === "entry" ? <article key={`${line.word}-${index}`}><strong>{line.word}</strong><span>{line.meaning}</span>{line.example && <em>{line.example}</em>}</article> : <p className="vocabulary-fallback" key={`fallback-${index}`}>{line.text}</p>)}
    </div>
  </div>;
}
