import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

@Entity('virtual_classroom_sessions')
export class VirtualClassroomSession extends BaseEntity {
  @Column({ name: 'schedule_id', type: 'uuid' }) scheduleId: string;
  @Index()
  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;
  @Column({ name: 'subject_id', type: 'uuid', nullable: true }) subjectId:
    | string
    | null;
  @Column({ name: 'teacher_id', type: 'uuid' }) teacherId: string;
  @Column({ name: 'session_id', type: 'uuid' }) sessionId: string;
  @Column({ name: 'term_id', type: 'uuid', nullable: true }) termId:
    | string
    | null;
  @Column({ length: 255 }) title: string;
  @Column({ name: 'starts_at', type: 'timestamptz' }) startsAt: Date;
  @Column({ name: 'ends_at', type: 'timestamptz' }) endsAt: Date;
  @Column({ default: 'scheduled' }) status:
    | 'scheduled'
    | 'live'
    | 'ended'
    | 'cancelled';
  @Column({ name: 'allow_student_chat', default: true })
  allowStudentChat: boolean;
  @Column({ name: 'allow_student_draw', default: false })
  allowStudentDraw: boolean;
  @Column({ name: 'whiteboard_snapshot', type: 'jsonb', nullable: true })
  whiteboardSnapshot: Record<string, unknown> | null;
}

@Entity('virtual_classroom_participants')
export class VirtualClassroomParticipant extends BaseEntity {
  @Index()
  @Column({ name: 'classroom_id', type: 'uuid' })
  classroomId: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column() role: 'teacher' | 'student' | 'admin';
  @Column({ name: 'joined_at', type: 'timestamptz' }) joinedAt: Date;
  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;
  @Column({ name: 'last_seen_at', type: 'timestamptz' }) lastSeenAt: Date;
}

@Entity('virtual_classroom_messages')
export class VirtualClassroomMessage extends BaseEntity {
  @Index()
  @Column({ name: 'classroom_id', type: 'uuid' })
  classroomId: string;
  @Column({ name: 'sender_id', type: 'uuid' }) senderId: string;
  @Column({ name: 'sender_role' }) senderRole: 'teacher' | 'student' | 'admin';
  @Column({ type: 'text' }) body: string;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
