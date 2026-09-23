import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { Student } from '../../student/entities/student.entity';

import { CbtAttempt } from './cbt-attempt.entity';
import { CbtEntranceInvite } from './cbt-entrance-invite.entity';
import { CbtIntake } from './cbt-intake.entity';

@Entity('cbt_applicants')
export class CbtApplicant extends BaseEntity {
  @Column({ name: 'intake_id', type: 'uuid' })
  intakeId: string;

  @ManyToOne(() => CbtIntake, (intake) => intake.applicants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'intake_id' })
  intake: CbtIntake;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ length: 320 })
  email: string;

  @Column({ length: 40, nullable: true })
  phone: string | null;

  @Column({ name: 'admitted_at', type: 'timestamptz', nullable: true })
  admittedAt: Date | null;

  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId: string | null;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'student_id' })
  student: Student | null;

  @OneToMany(() => CbtAttempt, (attempt) => attempt.applicant)
  attempts: CbtAttempt[];

  @OneToMany(() => CbtEntranceInvite, (invite) => invite.applicant)
  entranceInvites: CbtEntranceInvite[];
}
