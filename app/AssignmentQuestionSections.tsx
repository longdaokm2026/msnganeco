import type { ReactNode } from "react";
import { groupAssignmentQuestions, type GroupablePassage, type GroupableQuestion } from "./assignment-question-groups";

export default function AssignmentQuestionSections<Q extends GroupableQuestion, P extends GroupablePassage>({ questions, passages, renderQuestion }: {
  questions: Q[];
  passages: P[];
  renderQuestion: (question: Q, questionNumber: number) => ReactNode;
}) {
  const grouped = groupAssignmentQuestions(questions, passages);
  const hasStandalone = grouped.standaloneQuestions.length > 0;
  const hasReading = grouped.passageGroups.length > 0;

  return <div className="assignment-question-sections">
    {hasStandalone && <section className="assignment-question-part">
      <header className="assignment-part-heading"><span>PHẦN 1</span><h2>Từ vựng &amp; Ngữ pháp</h2></header>
      <div className="student-question-list">{grouped.standaloneQuestions.map((question) => renderQuestion(question, grouped.questionNumberById.get(question.id)!))}</div>
    </section>}
    {hasReading && <section className="assignment-question-part reading-part">
      <header className="assignment-part-heading"><span>PHẦN {hasStandalone ? 2 : 1}</span><h2>Reading</h2></header>
      {grouped.passageGroups.map(({ passage, passageNumber, questions: passageQuestions }) => <section className="reading-passage-group" key={passage.id}>
        <article className="student-passage"><span>READING {passageNumber}</span><h2>{passage.title || `Reading ${passageNumber}`}</h2><p>{passage.content}</p></article>
        <div className="student-question-list">{passageQuestions.map((question) => renderQuestion(question, grouped.questionNumberById.get(question.id)!))}</div>
      </section>)}
    </section>}
  </div>;
}
