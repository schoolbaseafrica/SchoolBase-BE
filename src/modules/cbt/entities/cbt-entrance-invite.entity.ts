import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtApplicant } from './cbt-applicant.entity';
import { CbtExam } from './cbt-exam.entity';

@Entity('cbt_entrance_invites')
export class CbtEntranceInvite extends BaseEntity {
  @Column({ name: 'applicant_id', type: 'uuid' })
  applicantId: string;

  @ManyToOne(() => CbtApplicant, (applicant) => applicant.entranceInvites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'applicant_id' })
  applicant: CbtApplicant;

  @Column({ name: 'exam_id', type: 'uuid' })
  examId: string;

  @ManyToOne(() => CbtExam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: CbtExam;

  /** A SHA-256 digest of the bearer token returned to the candidate. */
  @Column({ length: 64, unique: true })
  token: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
