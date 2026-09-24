import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  VirtualClassroomMessage,
  VirtualClassroomParticipant,
  VirtualClassroomSession,
} from './entities/virtual-classroom.entity';
import {
  CreateVirtualClassroomDto,
  SendVirtualClassroomMessageDto,
  UpdateClassroomPermissionsDto,
} from './virtual-classroom.dto';

@Injectable()
export class VirtualClassroomService {
  constructor(
    @InjectRepository(VirtualClassroomSession)
    private readonly sessions: Repository<VirtualClassroomSession>,
    @InjectRepository(VirtualClassroomParticipant)
    private readonly participants: Repository<VirtualClassroomParticipant>,
    @InjectRepository(VirtualClassroomMessage)
    private readonly messages: Repository<VirtualClassroomMessage>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateVirtualClassroomDto,
    userId: string,
    roles: string[],
  ) {
    const rows = (await this.dataSource.query(
      `SELECT schedule.id, timetable.class_id AS "classId", schedule.subject_id AS "subjectId",
        schedule.teacher_id AS "teacherId"
       FROM schedules schedule JOIN timetables timetable ON timetable.id = schedule.timetable_id
       WHERE schedule.id = $1 LIMIT 1`,
      [dto.scheduleId],
    )) as Array<{
      classId: string;
      subjectId: string | null;
      teacherId: string;
    }>;
    const schedule = rows[0];
    if (!schedule) throw new NotFoundException('Timetable schedule not found');
    if (!roles.includes('admin')) {
      const teacher = (await this.dataSource.query(
        `SELECT id FROM teachers WHERE user_id = $1`,
        [userId],
      )) as Array<{ id: string }>;
      if (teacher[0]?.id !== schedule.teacherId)
        throw new ForbiddenException(
          'Only the assigned teacher can schedule this classroom',
        );
    }
    if (new Date(dto.endsAt) <= new Date(dto.startsAt))
      throw new BadRequestException(
        'Classroom end time must be after its start time',
      );
    return this.sessions.save(
      this.sessions.create({
        ...dto,
        termId: dto.termId ?? null,
        classId: schedule.classId,
        subjectId: schedule.subjectId,
        teacherId: schedule.teacherId,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        status: 'scheduled',
        allowStudentChat: true,
        allowStudentDraw: false,
        whiteboardSnapshot: null,
      }),
    );
  }

  async list(
    userId: string,
    roles: string[],
    sessionId?: string,
    termId?: string,
  ) {
    const qb = this.sessions
      .createQueryBuilder('room')
      .orderBy('room.startsAt', 'DESC');
    if (sessionId) qb.andWhere('room.sessionId = :sessionId', { sessionId });
    if (termId) qb.andWhere('room.termId = :termId', { termId });
    if (roles.includes('teacher'))
      qb.andWhere(
        `room.teacherId = (SELECT id FROM teachers WHERE user_id = :userId)`,
        { userId },
      );
    if (roles.includes('student'))
      qb.andWhere(
        `EXISTS (SELECT 1 FROM students student JOIN class_students cs ON cs.student_id = student.id AND cs.is_active = true WHERE student.user_id = :userId AND cs.class_id = room.class_id AND cs.session_id = room.session_id)`,
        { userId },
      );
    return qb.getMany();
  }

  async join(id: string, userId: string, roles: string[]) {
    const room = await this.authorize(id, userId, roles);
    const role = roles.includes('admin')
      ? 'admin'
      : roles.includes('teacher')
        ? 'teacher'
        : 'student';
    const active = await this.participants.findOne({
      where: { classroomId: id, userId, leftAt: null },
    });
    const now = new Date();
    const participant =
      active ??
      this.participants.create({
        classroomId: id,
        userId,
        role,
        joinedAt: now,
        leftAt: null,
        lastSeenAt: now,
      });
    participant.lastSeenAt = now;
    await this.participants.save(participant);
    return { room, participant };
  }

  async leave(id: string, userId: string) {
    const active = await this.participants.findOne({
      where: { classroomId: id, userId, leftAt: null },
    });
    if (active) {
      active.leftAt = new Date();
      active.lastSeenAt = active.leftAt;
      await this.participants.save(active);
    }
    return { left: Boolean(active) };
  }

  async getMessages(id: string, userId: string, roles: string[]) {
    await this.authorize(id, userId, roles);
    return this.messages.find({
      where: { classroomId: id, deletedAt: null },
      order: { createdAt: 'ASC' },
      take: 500,
    });
  }

  async sendMessage(
    id: string,
    dto: SendVirtualClassroomMessageDto,
    userId: string,
    roles: string[],
  ) {
    const room = await this.authorize(id, userId, roles);
    const role = roles.includes('admin')
      ? 'admin'
      : roles.includes('teacher')
        ? 'teacher'
        : 'student';
    if (role === 'student' && !room.allowStudentChat)
      throw new ForbiddenException(
        'Student chat is disabled for this classroom',
      );
    return this.messages.save(
      this.messages.create({
        classroomId: id,
        senderId: userId,
        senderRole: role,
        body: dto.body.trim(),
        deletedAt: null,
      }),
    );
  }

  async updatePermissions(
    id: string,
    dto: UpdateClassroomPermissionsDto,
    userId: string,
    roles: string[],
  ) {
    const room = await this.authorize(id, userId, roles);
    if (!roles.includes('admin') && !roles.includes('teacher'))
      throw new ForbiddenException();
    Object.assign(room, dto);
    return this.sessions.save(room);
  }

  private async authorize(id: string, userId: string, roles: string[]) {
    const room = await this.sessions.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Virtual classroom not found');
    if (roles.includes('admin')) return room;
    const allowed = roles.includes('teacher')
      ? await this.dataSource.query(
          `SELECT 1 FROM teachers WHERE user_id = $1 AND id = $2`,
          [userId, room.teacherId],
        )
      : await this.dataSource.query(
          `SELECT 1 FROM students student JOIN class_students cs ON cs.student_id = student.id AND cs.is_active = true WHERE student.user_id = $1 AND cs.class_id = $2 AND cs.session_id = $3`,
          [userId, room.classId, room.sessionId],
        );
    if (!allowed.length)
      throw new ForbiddenException('You are not assigned to this classroom');
    return room;
  }
}
