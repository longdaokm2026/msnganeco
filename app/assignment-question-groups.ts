export type GroupableQuestion = {
  id: string;
  passageId: string | null;
  position: number;
};

export type GroupablePassage = {
  id: string;
  title: string | null;
  content: string;
  position: number;
};

export type PassageQuestionGroup<Q extends GroupableQuestion, P extends GroupablePassage> = {
  passage: P;
  passageNumber: number;
  questions: Q[];
};

export type AssignmentQuestionPart<Q extends GroupableQuestion, P extends GroupablePassage> =
  | { kind: "STANDALONE"; questions: Q[]; firstPosition: number }
  | { kind: "READING"; passageGroups: PassageQuestionGroup<Q, P>[]; firstPosition: number };

export function groupAssignmentQuestions<Q extends GroupableQuestion, P extends GroupablePassage>(questions: Q[], passages: P[]) {
  const orderedQuestions = questions.map((question, originalIndex) => ({ question, originalIndex }))
    .sort((left, right) => left.question.position - right.question.position || left.originalIndex - right.originalIndex)
    .map(({ question }) => question);
  const questionNumberById = new Map(orderedQuestions.map((question, index) => [question.id, index + 1]));
  const standaloneQuestions = orderedQuestions.filter((question) => question.passageId === null);
  const orderedPassages = passages.map((passage, originalIndex) => ({ passage, originalIndex }))
    .sort((left, right) => left.passage.position - right.passage.position || left.originalIndex - right.originalIndex)
    .map(({ passage }) => passage);
  const passageGroups = orderedPassages.map((passage) => ({
    passage,
    questions: orderedQuestions.filter((question) => question.passageId === passage.id),
  })).filter((group) => group.questions.length > 0).map((group, index) => ({ ...group, passageNumber: index + 1 }));
  const parts: AssignmentQuestionPart<Q, P>[] = [
    ...(standaloneQuestions.length ? [{ kind: "STANDALONE" as const, questions: standaloneQuestions, firstPosition: standaloneQuestions[0]!.position }] : []),
    ...(passageGroups.length ? [{ kind: "READING" as const, passageGroups, firstPosition: Math.min(...passageGroups.flatMap((group) => group.questions.map((question) => question.position))) }] : []),
  ].sort((left, right) => left.firstPosition - right.firstPosition);

  return { standaloneQuestions, passageGroups, parts, questionNumberById };
}
