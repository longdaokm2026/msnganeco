import type { ReactNode } from "react";
import { groupAssignmentQuestions, type GroupablePassage, type GroupableQuestion } from "./assignment-question-groups";

export default function AssignmentQuestionSections<Q extends GroupableQuestion, P extends GroupablePassage>({ questions, passages, renderQuestion }: {
  questions: Q[];
  passages: P[];
  renderQuestion: (question: Q, questionNumber: number) => ReactNode;
}) {
  const grouped = groupAssignmentQuestions(questions, passages);

  return <div className="assignment-question-sections">
    {grouped.parts.map((part, partIndex) => part.kind === "STANDALONE" ? <section className="assignment-question-part" key="vocabulary-grammar">
      <header className="assignment-part-heading"><span>PHẦN {partIndex + 1}</span><h2>Vocabulary - Grammar</h2></header>
      <div className="student-question-list">{part.questions.map((question) => renderQuestion(question, grouped.questionNumberById.get(question.id)!))}</div>
    </section> : <section className="assignment-question-part reading-part" key="reading">
      <header className="assignment-part-heading"><span>PHẦN {partIndex + 1}</span><h2>Reading</h2></header>
      {part.passageGroups.map(({ passage, passageNumber, questions: passageQuestions }) => <section className="reading-passage-group" key={passage.id}>
        <article className="student-passage"><span>READING {passageNumber}</span><h2>{passage.title || `Reading ${passageNumber}`}</h2><p>{passage.content}</p></article>
        <div className="student-question-list">{passageQuestions.map((question) => renderQuestion(question, grouped.questionNumberById.get(question.id)!))}</div>
      </section>)}
    </section>)}
  </div>;
}
