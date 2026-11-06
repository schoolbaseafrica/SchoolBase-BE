import { CbtQuestionType } from './entities';

function normalizeScalar(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function normalizeList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.map(normalizeScalar).filter(Boolean).sort();
}

export function answerIsCorrect(
  type: CbtQuestionType,
  answer: unknown,
  correctAnswer: string | null,
): boolean | null {
  if (type === CbtQuestionType.ESSAY || correctAnswer === null) return null;

  const submitted =
    answer && typeof answer === 'object' && 'value' in answer
      ? (answer as { value: unknown }).value
      : answer;

  if (type === CbtQuestionType.MULTIPLE_RESPONSE) {
    let expected: unknown = correctAnswer;
    try {
      expected = JSON.parse(correctAnswer);
    } catch {
      expected = correctAnswer.split(',');
    }
    return (
      JSON.stringify(normalizeList(submitted)) ===
      JSON.stringify(normalizeList(expected))
    );
  }

  return normalizeScalar(submitted) === normalizeScalar(correctAnswer);
}
