"use client";

import AssignmentQuestionSections from "./AssignmentQuestionSections";
import { printableQuestion } from "../apps/shared/assignment-print";

type PrintQuestion = { id: string; position: number; passageId: string | null; type: string; prompt: string; points: number; config: Record<string, unknown> };
type PrintPassage = { id: string; position: number; title: string | null; content: string };

const ruled = (count: number) => Array.from({ length: count }, (_, index) => <span className="print-answer-line" key={index} />);

export default function AssignmentPrintView({ title, meta, questions, passages, writingPrompt }: {
  title: string;
  meta: string;
  questions: PrintQuestion[];
  passages: PrintPassage[];
  writingPrompt: string | null;
}) {
  return <div className="assignment-print" aria-hidden="true">
    <header className="assignment-print-heading">
      <div><strong>Ms Ngân English</strong><h1>{title}</h1><p>{meta}</p></div>
      <dl><div><dt>Họ và tên</dt><dd /></div><div><dt>Lớp</dt><dd /></div><div><dt>Điểm</dt><dd /></div></dl>
    </header>
    <AssignmentQuestionSections
      questions={questions}
      passages={passages}
      renderQuestion={(question, questionNumber) => {
        const printable = printableQuestion(question.type, question.config);
        return <article className="print-question" key={question.id}>
          <p className="print-question-prompt"><b>{questionNumber}.</b> {question.prompt} <em>({question.points} điểm)</em></p>
          {printable.kind === "choice" && <ol className="print-options">{printable.options.map((option, index) => <li key={index}><span>{"ABCDEFGH"[index]}.</span> {option}</li>)}</ol>}
          {printable.kind === "truefalse" && <p className="print-options-inline">{printable.values.map((value) => <span key={value}>☐ {value}</span>)}</p>}
          {printable.kind === "matching" && <table className="print-matching"><tbody>{printable.left.map((left, index) => <tr key={index}><td>{index + 1}. {left}</td><td className="print-matching-gap">……</td><td>{"ABCDEFGH"[index]}. {printable.right[index] ?? ""}</td></tr>)}</tbody></table>}
          {printable.kind === "order" && <p className="print-tokens">{printable.tokens.join(" / ")}</p>}
          {printable.kind !== "choice" && printable.kind !== "truefalse" && <div className="print-answer">{ruled(printable.kind === "text" ? printable.answerLines : 1)}</div>}
        </article>;
      }}
    />
    {writingPrompt && <section className="assignment-question-part">
      <header className="assignment-part-heading"><span>PHẦN VIẾT</span><h2>Writing</h2></header>
      <p className="print-question-prompt">{writingPrompt}</p>
      <div className="print-answer">{ruled(12)}</div>
    </section>}
  </div>;
}
