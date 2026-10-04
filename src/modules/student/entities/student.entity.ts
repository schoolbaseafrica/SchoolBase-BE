import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { ClassStudent } from '../../class/entities/class-student.entity';
import { Class } from '../../class/entities/class.entity';
import { Parent } from '../../parent/entities/parent.entity';
import { Stream } from '../../stream/entities/stream.entity';
import { User } from '../../user/entities/user.entity';

@Entity('students')
export class Student extends BaseEntity {
  @Column({ unique: true, name: 'registration_number' })
  registration_number: string;

  @Column({ name: 'photo_url', nullable: true })
  photo_url: string;

  @Column({
    name: 'face_photo_object_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  face_photo_object_key?: string | null;

  @Column({
    name: 'face_photo_approved_at',
    type: 'timestamptz',
    nullable: true,
  })
  face_photo_approved_at?: Date | null;

  @Column({ name: 'face_photo_approved_by', type: 'uuid', nullable: true })
  face_photo_approved_by?: string | null;

  @Index('IDX_schoolbase_students_nfc_card_id', {
    unique: true,
    where: '"nfc_card_id" IS NOT NULL',
  })
  @Column({ name: 'nfc_card_id', type: 'varchar', nullable: true })
  nfc_card_id?: string | null;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Stream, (stream) => stream.students)
  @JoinColumn({ name: 'stream_id' })
  stream: Stream;

  @OneToMany(() => ClassStudent, (assignment) => assignment.student)
  class_assignments: ClassStudent[];

  @Index()
  @Column({ name: 'current_class_id', nullable: true, type: 'uuid' })
  current_class_id: string | null;

  @ManyToOne(() => Class, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_class_id' })
  current_class: Class | null;

  @Column({ type: 'boolean', default: false })
  is_deleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deleted_at: Date | null;

  @ManyToOne(() => Parent, (parent) => parent.students)
  @JoinColumn({ name: 'parent_id' })
  parent: Parent;
}
