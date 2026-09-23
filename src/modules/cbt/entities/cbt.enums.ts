export enum CbtExamType {
  IN_SCHOOL = 'in_school',
  ENTRANCE = 'entrance',
}

export enum CbtExamStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum CbtProctoringMode {
  NONE = 'none',
  HUMAN = 'human',
  RECORDED = 'recorded',
  BOTH = 'both',
}

export enum CbtQuestionType {
  MULTIPLE_CHOICE = 'mcq',
  MULTIPLE_RESPONSE = 'multiple_response',
  TRUE_FALSE = 'true_false',
  SHORT_ANSWER = 'short_answer',
  ESSAY = 'essay',
}

export enum CbtQuestionDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum CbtAttemptStatus {
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
}

export enum CbtAttemptEventType {
  STARTED = 'started',
  RESUMED = 'resumed',
  ANSWER_SAVED = 'answer_saved',
  CONNECTION_LOST = 'connection_lost',
  CONNECTION_RESTORED = 'connection_restored',
  VISIBILITY_HIDDEN = 'visibility_hidden',
  VISIBILITY_VISIBLE = 'visibility_visible',
  SUBMITTED = 'submitted',
  AUTO_SUBMITTED = 'auto_submitted',
}
