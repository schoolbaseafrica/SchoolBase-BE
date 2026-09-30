import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { AcademicSession } from '../../academic-session/entities/academic-session.entity';
import { Term } from '../../academic-term/entities/term.entity';
import { Class } from '../../class/entities/class.entity';
import { Student } from '../../student/entities/student.entity';
import { Subject } from '../../subject/entities/subject.entity';
import { Teacher } from '../../teacher/entities/teacher.entity';

export enum AssignmentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum AssignmentSubmissionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  RETURNED = 'returned',
}

@Entity('assignments')
@Index(['classroom', 'academicSession', 'academicTerm'])
export class Assignment extends BaseEntity {
  @Column({ length: 180 }) title: string;
  @Column({ type: 'text' }) instructions: string;
  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string | null;
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;
  @Column({
    name: 'total_marks',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 100,
  })
  totalMarks: number;
  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.DRAFT,
  })
  status: AssignmentStatus;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @ManyToOne(() => Class, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  classroom: Class;
  @ManyToOne(() => Subject, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;
  @ManyToOne(() => Teacher, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: Teacher;
  @ManyToOne(() => AcademicSession, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_session_id' })
  academicSession: AcademicSession;
  @ManyToOne(() => Term, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_term_id' })
  academicTerm: Term | null;
  @OneToMany(() => AssignmentSubmission, (submission) => submission.assignment)
  submissions: AssignmentSubmission[];
}

@Entity('assignment_submissions')
@Index(['assignment', 'student'], { unique: true })
export class AssignmentSubmission extends BaseEntity {
  @ManyToOne(() => Assignment, (assignment) => assignment.submissions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assignment_id' })
  assignment: Assignment;
  @ManyToOne(() => Student, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;
  @Column({ name: 'response_text', type: 'text', nullable: true })
  responseText: string | null;
  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string | null;
  @Column({
    type: 'enum',
    enum: AssignmentSubmissionStatus,
    default: AssignmentSubmissionStatus.DRAFT,
  })
  status: AssignmentSubmissionStatus;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;
  @Column({ name: 'is_late', type: 'boolean', default: false }) isLate: boolean;
  @Column({
    name: 'marks_awarded',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  marksAwarded: number | null;
  @Column({ type: 'text', nullable: true }) feedback: string | null;
  @Column({ name: 'graded_at', type: 'timestamptz', nullable: true })
  gradedAt: Date | null;
}
