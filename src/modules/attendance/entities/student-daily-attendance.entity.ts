import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { Class } from '../../class/entities/class.entity';
import { User } from '../../user/entities/user.entity';
import {
  DailyAttendanceStatus,
  EditRequestStatus,
  AttendanceType,
} from '../enums/attendance-status.enum';

import { BaseAttendanceEntity } from './attendance.entity';

/**
 * Daily student attendance - one record per student per day
 * This tracks overall daily presence (morning register)
 */
@Entity('student_daily_attendance')
@Index(['student_id', 'class_id', 'date'], { unique: true })
@Index(['class_id'])
@Index(['student_id'])
@Index(['date'])
@Index(['session_id'])
export class StudentDailyAttendance extends BaseAttendanceEntity {
  @Column({ name: 'class_id', type: 'uuid' })
  class_id: string;

  @Column({
    type: 'enum',
    enum: DailyAttendanceStatus,
    default: DailyAttendanceStatus.ABSENT,
  })
  status: DailyAttendanceStatus;

  @Column({ type: 'timestamp', nullable: true })
  check_in_time?: Date;

  @Column({ type: 'timestamp', nullable: true })
  check_out_time?: Date;

  // Class relation
  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  class?: Class;
}

/**
 * Tracks edit requests for locked attendance records
 * Teachers submit requests, admins approve/reject
 */
@Entity('attendance_edit_requests')
@Index(['attendance_id', 'attendance_type'])
@Index(['requested_by'])
@Index(['status'])
export class AttendanceEditRequest extends BaseEntity {
  @Column({ name: 'attendance_id', type: 'uuid' })
  attendance_id: string;

  @Column({
    name: 'attendance_type',
    type: 'enum',
    enum: AttendanceType,
  })
  attendance_type: AttendanceType;

  @Column({ name: 'requested_by', type: 'uuid' })
  requested_by: string;

  @Column({ type: 'jsonb' })
  proposed_changes: Record<string, unknown>;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: EditRequestStatus,
    default: EditRequestStatus.PENDING,
  })
  status: EditRequestStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewed_by?: string;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewed_at?: Date;

  @Column({ name: 'admin_comment', type: 'text', nullable: true })
  admin_comment?: string;

  // Relations
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'requested_by' })
  requestedBy?: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedBy?: User;
}
