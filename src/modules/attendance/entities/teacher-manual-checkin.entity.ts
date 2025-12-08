import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Teacher } from 'src/modules/teacher/entities/teacher.entity';
import { User } from 'src/modules/user/entities/user.entity';

import { BaseEntity } from '../../../entities/base-entity';
import { TeacherManualCheckinStatusEnum } from '../enums';

@Entity('teacher_manual_checkins')
@Index(['teacher_id', 'check_in_date'], { unique: true })
export class TeacherManualCheckin extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacher_id: string;

  @Column({ name: 'check_in_date', type: 'date' })
  check_in_date: Date;

  @Column({ name: 'check_in_time', type: 'timestamp' })
  check_in_time: Date;

  @Column({ name: 'submitted_at', type: 'timestamp' })
  submitted_at: Date;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: TeacherManualCheckinStatusEnum,
    default: TeacherManualCheckinStatusEnum.PENDING,
  })
  status: TeacherManualCheckinStatusEnum;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewed_by?: string;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewed_at?: Date;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  review_notes?: string;

  // Relationships
  @ManyToOne(() => Teacher)
  @JoinColumn({ name: 'teacher_id' })
  teacher?: Teacher;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: User;
}
