import { answerIsCorrect } from './cbt-scoring';
import { CbtQuestionType } from './entities';

describe('answerIsCorrect', () => {
  it('normalizes objective text answers', () => {
    expect(
      answerIsCorrect(
        CbtQuestionType.SHORT_ANSWER,
        { value: '  Lagos ' },
        'lagos',
      ),
    ).toBe(true);
  });

  it('compares multiple responses without depending on selection order', () => {
    expect(
      answerIsCorrect(
        CbtQuestionType.MULTIPLE_RESPONSE,
        { value: ['c', 'a'] },
        JSON.stringify(['a', 'c']),
      ),
    ).toBe(true);
  });

  it('leaves essays for manual marking', () => {
    expect(
      answerIsCorrect(CbtQuestionType.ESSAY, { value: 'My answer' }, null),
    ).toBeNull();
  });
});
