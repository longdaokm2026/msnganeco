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

  return { standaloneQuestions, passageGroups, questionNumberById };
}
