import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtAttempt } from './cbt-attempt.entity';

@Entity('cbt_screen_recordings')
@Index(
  'UQ_cbt_screen_recordings_part',
  ['attemptId', 'recordingId', 'partNumber'],
  {
    unique: true,
  },
)
export class CbtScreenRecording extends BaseEntity {
  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @ManyToOne(() => CbtAttempt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id' })
  attempt: CbtAttempt;

  @Column({ name: 'recording_id', type: 'uuid' })
  recordingId: string;

  @Column({ name: 'part_number', type: 'integer' })
  partNumber: number;

  @Column({ name: 'object_key', type: 'text' })
  objectKey: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType: string;

  @Column({ name: 'byte_size', type: 'integer' })
  byteSize: number;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs: number;
}
