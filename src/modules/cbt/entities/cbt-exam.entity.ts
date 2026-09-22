import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { Class } from '../../class/entities/class.entity';

import { CbtExamSection } from './cbt-exam-section.entity';
import { CbtQuestion } from './cbt-question.entity';
import { CbtExamStatus, CbtExamType, CbtProctoringMode } from './cbt.enums';

@Entity('cbt_exams')
export class CbtExam extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({
    name: 'exam_type',
    type: 'enum',
    enum: CbtExamType,
    enumName: 'cbt_exam_type_enum',
    default: CbtExamType.IN_SCHOOL,
  })
  examType: CbtExamType;

  @Column({ name: 'term_id', type: 'uuid', nullable: true })
  termId: string | null;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ name: 'intake_id', type: 'uuid', nullable: true })
  intakeId: string | null;

  @Column({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId: string | null;

  @Column({ name: 'time_limit_minutes', type: 'int', default: 60 })
  timeLimitMinutes: number;

  @Column({ name: 'max_attempts', type: 'int', default: 1 })
  maxAttempts: number;

  @Column({ name: 'available_from', type: 'timestamptz', nullable: true })
  availableFrom: Date | null;

  @Column({ name: 'available_to', type: 'timestamptz', nullable: true })
  availableTo: Date | null;

  @Column({
    type: 'enum',
    enum: CbtExamStatus,
    enumName: 'cbt_exam_status_enum',
    default: CbtExamStatus.DRAFT,
  })
  status: CbtExamStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    name: 'proctoring_mode',
    type: 'enum',
    enum: CbtProctoringMode,
    enumName: 'cbt_proctoring_mode_enum',
    default: CbtProctoringMode.NONE,
  })
  proctoringMode: CbtProctoringMode;

  @Column({ name: 'pass_mark_percent', type: 'int', nullable: true })
  passMarkPercent: number | null;

  @Column({ name: 'shuffle_questions', default: true })
  shuffleQuestions: boolean;

  @Column({ name: 'shuffle_options', default: true })
  shuffleOptions: boolean;

  @Column({ name: 'show_result_immediately', default: false })
  showResultImmediately: boolean;

  @ManyToMany(() => Class)
  @JoinTable({
    name: 'cbt_exam_classes',
    joinColumn: { name: 'exam_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'class_id', referencedColumnName: 'id' },
  })
  classes: Class[];

  @OneToMany(() => CbtExamSection, (section) => section.exam)
  sections: CbtExamSection[];

  @OneToMany(() => CbtQuestion, (question) => question.exam)
  questions: CbtQuestion[];
}
