import { validateCbtQuestionDefinition } from './cbt-question-validation';
import { CbtQuestionType } from './entities';

describe('validateCbtQuestionDefinition', () => {
  const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('accepts answer keys that reference available options', () => {
    expect(
      validateCbtQuestionDefinition({
        type: CbtQuestionType.MULTIPLE_CHOICE,
        options,
        correctAnswer: 'b',
      }),
    ).toBeNull();
    expect(
      validateCbtQuestionDefinition({
        type: CbtQuestionType.MULTIPLE_RESPONSE,
        options,
        correctAnswer: JSON.stringify(['a', 'c']),
      }),
    ).toBeNull();
  });

  it('rejects invalid or duplicate option references', () => {
    expect(
      validateCbtQuestionDefinition({
        type: CbtQuestionType.MULTIPLE_CHOICE,
        options,
        correctAnswer: 'missing',
      }),
    ).toBe('The correct answer must match an option ID');
    expect(
      validateCbtQuestionDefinition({
        type: CbtQuestionType.MULTIPLE_RESPONSE,
        options,
        correctAnswer: JSON.stringify(['a', 'a']),
      }),
    ).toBe('Every correct answer must match a unique option ID');
  });

  it('restricts true-or-false answer keys', () => {
    expect(
      validateCbtQuestionDefinition({
        type: CbtQuestionType.TRUE_FALSE,
        correctAnswer: 'yes',
      }),
    ).toBe('True-or-false answers must be true or false');
  });
});
