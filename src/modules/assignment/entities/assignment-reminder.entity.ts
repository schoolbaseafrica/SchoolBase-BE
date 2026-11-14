import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { Student } from '../../student/entities/student.entity';

import { Assignment } from './assignment.entity';

export enum AssignmentReminderType {
  DUE_SOON = 'due_soon',
  OVERDUE = 'overdue',
}

@Entity('school_assignment_reminders')
@Index(['assignment', 'student', 'type'], { unique: true })
export class AssignmentReminder extends BaseEntity {
  @ManyToOne(() => Assignment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: Assignment;

  @ManyToOne(() => Student, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'varchar', length: 20 })
  type: AssignmentReminderType;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;
}
