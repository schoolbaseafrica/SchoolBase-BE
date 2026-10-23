import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { Student } from '../../student/entities/student.entity';

import { Assignment } from './assignment.entity';

@Entity('school_assignment_attachments')
@Index(['assignment', 'student'])
export class AssignmentAttachment extends BaseEntity {
  @ManyToOne(() => Assignment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: Assignment;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student | null;

  @Column({ name: 'object_key', type: 'text', unique: true })
  objectKey: string;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', length: 120 })
  mimeType: string;

  @Column({ type: 'integer' })
  size: number;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;
}
