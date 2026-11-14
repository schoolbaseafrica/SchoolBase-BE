import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtExam } from './cbt-exam.entity';
import { CbtQuestion } from './cbt-question.entity';

@Entity('cbt_exam_sections')
@Unique(['examId', 'title'])
export class CbtExamSection extends BaseEntity {
  @Column({ name: 'exam_id', type: 'uuid' })
  examId: string;

  @ManyToOne(() => CbtExam, (exam) => exam.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: CbtExam;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'question_limit', type: 'int', nullable: true })
  questionLimit: number | null;

  @OneToMany(() => CbtQuestion, (question) => question.section)
  questions: CbtQuestion[];
}
