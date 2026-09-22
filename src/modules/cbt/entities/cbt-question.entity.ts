import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtExamSection } from './cbt-exam-section.entity';
import { CbtExam } from './cbt-exam.entity';
import { CbtQuestionDifficulty, CbtQuestionType } from './cbt.enums';

export interface ICbtQuestionOption {
  id: string;
  text: string;
}

@Entity('cbt_questions')
export class CbtQuestion extends BaseEntity {
  @Column({ name: 'exam_id', type: 'uuid', nullable: true })
  examId: string | null;

  @ManyToOne(() => CbtExam, (exam) => exam.questions, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'exam_id' })
  exam: CbtExam | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => CbtExamSection, (section) => section.questions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'section_id' })
  section: CbtExamSection | null;

  @Column({
    type: 'enum',
    enum: CbtQuestionType,
    enumName: 'cbt_question_type_enum',
    default: CbtQuestionType.MULTIPLE_CHOICE,
  })
  type: CbtQuestionType;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  options: ICbtQuestionOption[] | null;

  @Column({
    name: 'correct_answer',
    type: 'text',
    nullable: true,
    select: false,
  })
  correctAnswer: string | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 1 })
  marks: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ length: 255, nullable: true })
  topic: string | null;

  @Column({
    type: 'enum',
    enum: CbtQuestionDifficulty,
    enumName: 'cbt_question_difficulty_enum',
    default: CbtQuestionDifficulty.MEDIUM,
  })
  difficulty: CbtQuestionDifficulty;

  @Column({ type: 'text', nullable: true, select: false })
  explanation: string | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;
}
