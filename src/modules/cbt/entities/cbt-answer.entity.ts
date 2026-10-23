import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtAttempt } from './cbt-attempt.entity';
import { CbtQuestion } from './cbt-question.entity';

@Entity('cbt_answers')
@Unique(['attemptId', 'questionId'])
export class CbtAnswer extends BaseEntity {
  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @ManyToOne(() => CbtAttempt, (attempt) => attempt.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id' })
  attempt: CbtAttempt;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @ManyToOne(() => CbtQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: CbtQuestion;

  @Column({ name: 'selected_answer', type: 'text', nullable: true })
  selectedAnswer: string | null;

  @Column({ name: 'answer_data', type: 'jsonb', nullable: true })
  answerData: unknown;

  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect: boolean | null;

  @Column({
    name: 'marks_awarded',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  marksAwarded: string | null;

  @Column({ type: 'int', default: 1 })
  revision: number;

  @Column({ name: 'saved_at', type: 'timestamptz', nullable: true })
  savedAt: Date | null;
}
