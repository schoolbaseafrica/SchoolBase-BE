import { CbtQuestionType } from './entities';

interface IQuestionDefinition {
  type: CbtQuestionType;
  options?: Array<{ id: string }>;
  correctAnswer?: string;
}

export function normalizeCbtQuestionBody(body: string) {
  return body.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function validateCbtQuestionDefinition(
  definition: IQuestionDefinition,
): string | null {
  const objectiveTypes = [
    CbtQuestionType.MULTIPLE_CHOICE,
    CbtQuestionType.MULTIPLE_RESPONSE,
    CbtQuestionType.TRUE_FALSE,
    CbtQuestionType.SHORT_ANSWER,
  ];
  if (
    objectiveTypes.includes(definition.type) &&
    !definition.correctAnswer?.trim()
  ) {
    return 'Objective questions require a correct answer';
  }

  const isChoiceQuestion = [
    CbtQuestionType.MULTIPLE_CHOICE,
    CbtQuestionType.MULTIPLE_RESPONSE,
  ].includes(definition.type);
  if (
    isChoiceQuestion &&
    (!definition.options || definition.options.length < 2)
  ) {
    return 'Choice questions require at least two options';
  }

  const optionIds = definition.options?.map((option) => option.id) ?? [];
  if (new Set(optionIds).size !== optionIds.length) {
    return 'Question option IDs must be unique';
  }
  if (
    definition.type === CbtQuestionType.MULTIPLE_CHOICE &&
    !optionIds.includes(definition.correctAnswer!)
  ) {
    return 'The correct answer must match an option ID';
  }
  if (definition.type === CbtQuestionType.MULTIPLE_RESPONSE) {
    let correctIds: unknown;
    try {
      correctIds = JSON.parse(definition.correctAnswer!);
    } catch {
      return 'Multiple-response answers must be a JSON array of option IDs';
    }
    if (
      !Array.isArray(correctIds) ||
      !correctIds.length ||
      correctIds.some(
        (id) => typeof id !== 'string' || !optionIds.includes(id),
      ) ||
      new Set(correctIds).size !== correctIds.length
    ) {
      return 'Every correct answer must match a unique option ID';
    }
  }
  if (
    definition.type === CbtQuestionType.TRUE_FALSE &&
    !['true', 'false'].includes(definition.correctAnswer!.trim().toLowerCase())
  ) {
    return 'True-or-false answers must be true or false';
  }
  return null;
}
