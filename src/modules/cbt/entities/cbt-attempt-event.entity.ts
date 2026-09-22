import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtAttempt } from './cbt-attempt.entity';
import { CbtAttemptEventType } from './cbt.enums';

@Entity('cbt_attempt_events')
export class CbtAttemptEvent extends BaseEntity {
  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @ManyToOne(() => CbtAttempt, (attempt) => attempt.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id' })
  attempt: CbtAttempt;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: CbtAttemptEventType,
    enumName: 'cbt_attempt_event_type_enum',
  })
  eventType: CbtAttemptEventType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
