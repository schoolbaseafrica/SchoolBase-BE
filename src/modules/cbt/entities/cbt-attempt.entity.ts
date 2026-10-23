import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtAnswer } from './cbt-answer.entity';
import { CbtApplicant } from './cbt-applicant.entity';
import { CbtAttemptEvent } from './cbt-attempt-event.entity';
import { CbtExam } from './cbt-exam.entity';
import { CbtAttemptStatus } from './cbt.enums';

@Entity('cbt_attempts')
export class CbtAttempt extends BaseEntity {
  @Column({ name: 'exam_id', type: 'uuid' })
  examId: string;

  @ManyToOne(() => CbtExam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: CbtExam;

  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId: string | null;

  @Column({ name: 'applicant_id', type: 'uuid', nullable: true })
  applicantId: string | null;

  @ManyToOne(() => CbtApplicant, (applicant) => applicant.attempts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'applicant_id' })
  applicant: CbtApplicant | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({
    type: 'enum',
    enum: CbtAttemptStatus,
    enumName: 'cbt_attempt_status_enum',
    default: CbtAttemptStatus.IN_PROGRESS,
  })
  status: CbtAttemptStatus;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  score: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'last_saved_at', type: 'timestamptz', nullable: true })
  lastSavedAt: Date | null;

  @OneToMany(() => CbtAnswer, (answer) => answer.attempt)
  answers: CbtAnswer[];

  @OneToMany(() => CbtAttemptEvent, (event) => event.attempt)
  events: CbtAttemptEvent[];
}
