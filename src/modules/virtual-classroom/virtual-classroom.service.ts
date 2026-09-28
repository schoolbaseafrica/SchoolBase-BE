import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_CLASSROOM_VOICE_NOTE_DURATION,
  MAX_CLASSROOM_VOICE_NOTE_SIZE,
} from '../../constants/file-upload.constants';
import { MinioService } from '../upload/services/minio.service';

import {
  VirtualClassroomMessage,
  VirtualClassroomParticipant,
  VirtualClassroomSession,
} from './entities/virtual-classroom.entity';
import {
  CreateVirtualClassroomDto,
  SendVirtualClassroomMessageDto,
  UpdateClassroomPermissionsDto,
  UpdateWhiteboardSnapshotDto,
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
    private readonly minio: MinioService,
  ) {}

  async create(
    dto: CreateVirtualClassroomDto,
    userId: string,
    roles: string[],
  ) {
    const rows = (await this.dataSource.query(
      `SELECT schedule.id, timetable.class_id AS "classId", schedule.subject_id AS "subjectId",
        schedule.teacher_id AS "teacherId", class.academic_session_id AS "sessionId"
       FROM schedules schedule JOIN timetables timetable ON timetable.id = schedule.timetable_id
       JOIN class ON class.id = timetable.class_id
       WHERE schedule.id = $1 LIMIT 1`,
      [dto.scheduleId],
    )) as Array<{
      classId: string;
      subjectId: string | null;
      teacherId: string;
      sessionId: string;
    }>;
    const schedule = rows[0];
    if (!schedule) throw new NotFoundException('Timetable schedule not found');
    if (schedule.sessionId !== dto.sessionId)
      throw new BadRequestException(
        'The timetable schedule does not belong to this academic session',
      );
    if (dto.termId) {
      const term = (await this.dataSource.query(
        `SELECT id FROM terms WHERE id = $1 AND session_id = $2 LIMIT 1`,
        [dto.termId, dto.sessionId],
      )) as Array<{ id: string }>;
      if (!term.length)
        throw new BadRequestException(
          'The selected term does not belong to this academic session',
        );
    }
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
        whiteboardVersion: 0,
      }),
    );
  }

  async get(id: string, userId: string, roles: string[]) {
    return this.authorize(id, userId, roles);
  }

  async updateStatus(
    id: string,
    status: 'live' | 'ended' | 'cancelled',
    userId: string,
    roles: string[],
  ) {
    const room = await this.authorize(id, userId, roles);
    if (!roles.includes('admin') && !roles.includes('teacher'))
      throw new ForbiddenException('Only teachers and admins control a class');

    const transitions: Record<string, string[]> = {
      scheduled: ['live', 'cancelled'],
      live: ['ended'],
      ended: [],
      cancelled: [],
    };
    if (!transitions[room.status].includes(status))
      throw new BadRequestException(
        `A ${room.status} classroom cannot transition to ${status}`,
      );

    room.status = status;
    if (status === 'ended' || status === 'cancelled') {
      await this.participants.update(
        { classroomId: id, leftAt: null },
        { leftAt: new Date(), lastSeenAt: new Date() },
      );
    }
    return this.sessions.save(room);
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
    if (room.status !== 'live')
      throw new BadRequestException(
        room.status === 'scheduled'
          ? 'This classroom has not started yet'
          : 'This classroom is no longer open',
      );
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

  async heartbeat(id: string, userId: string, roles: string[]) {
    const room = await this.authorize(id, userId, roles);
    if (room.status !== 'live')
      throw new BadRequestException('This classroom is not live');
    const active = await this.participants.findOne({
      where: { classroomId: id, userId, leftAt: null },
    });
    if (!active)
      throw new BadRequestException('Join the classroom before checking in');
    active.lastSeenAt = new Date();
    await this.participants.save(active);
    return { lastSeenAt: active.lastSeenAt };
  }

  async getParticipants(id: string, userId: string, roles: string[]) {
    await this.authorize(id, userId, roles);
    if (!roles.includes('admin') && !roles.includes('teacher'))
      throw new ForbiddenException('Participant details are restricted');
    return this.participants.find({
      where: { classroomId: id },
      order: { joinedAt: 'ASC' },
    });
  }

  async getWhiteboard(id: string, userId: string, roles: string[]) {
    const room = await this.authorize(id, userId, roles);
    return {
      version: room.whiteboardVersion,
      snapshot: room.whiteboardSnapshot ?? {},
      allowStudentDraw: room.allowStudentDraw,
    };
  }

  async updateWhiteboard(
    id: string,
    dto: UpdateWhiteboardSnapshotDto,
    userId: string,
    roles: string[],
  ) {
    const room = await this.authorize(id, userId, roles);
    if (room.status !== 'live')
      throw new BadRequestException(
        'The whiteboard is editable only while live',
      );
    const isStudent = roles.includes('student');
    if (isStudent && !room.allowStudentDraw)
      throw new ForbiddenException('Student drawing is disabled');

    const result = await this.sessions
      .createQueryBuilder()
      .update(VirtualClassroomSession)
      .set({
        whiteboardSnapshot: dto.snapshot,
        whiteboardVersion: () => '"whiteboard_version" + 1',
      })
      .where('id = :id', { id })
      .andWhere('whiteboard_version = :version', { version: dto.version })
      .execute();
    if (!result.affected)
      throw new ConflictException(
        'The whiteboard changed on another device. Refresh before saving again.',
      );
    return { version: dto.version + 1, snapshot: dto.snapshot };
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
    const messages = await this.messages.find({
      where: { classroomId: id, deletedAt: null },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    return messages.map((message) => ({
      ...message,
      audioUrl: message.audioObjectKey
        ? `/virtual-classrooms/${id}/messages/${message.id}/audio`
        : null,
    }));
  }

  async sendMessage(
    id: string,
    dto: SendVirtualClassroomMessageDto,
    userId: string,
    roles: string[],
  ) {
    const role = await this.authorizeChat(id, userId, roles);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('A text message is required');
    return this.messages.save(
      this.messages.create({
        classroomId: id,
        senderId: userId,
        senderRole: role,
        body,
        messageType: 'text',
        audioObjectKey: null,
        audioDuration: null,
        audioMimeType: null,
        audioSize: null,
        deletedAt: null,
      }),
    );
  }

  async sendVoiceNote(
    id: string,
    file: IMulterFile,
    duration: number,
    userId: string,
    roles: string[],
  ) {
    const role = await this.authorizeChat(id, userId, roles);
    if (!file) throw new BadRequestException('Choose a voice note to send');
    const mimeType = file.mimetype.split(';')[0].toLowerCase();
    if (!ALLOWED_AUDIO_MIME_TYPES.includes(mimeType))
      throw new BadRequestException(
        'Voice notes must be WebM, OGG, MP4, MP3, or WAV audio',
      );
    if (file.size > MAX_CLASSROOM_VOICE_NOTE_SIZE)
      throw new BadRequestException('Voice notes cannot exceed 8 MB');
    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > MAX_CLASSROOM_VOICE_NOTE_DURATION
    )
      throw new BadRequestException(
        'Voice notes must be between 1 and 120 seconds',
      );

    const uploaded = await this.minio.uploadFile(
      file,
      `classrooms/${id}/voice-notes`,
    );
    try {
      const message = await this.messages.save(
        this.messages.create({
          classroomId: id,
          senderId: userId,
          senderRole: role,
          body: null,
          messageType: 'voice',
          audioObjectKey: uploaded.publicId,
          audioDuration: duration,
          audioMimeType: mimeType,
          audioSize: file.size,
          deletedAt: null,
        }),
      );
      return {
        ...message,
        audioUrl: `/virtual-classrooms/${id}/messages/${message.id}/audio`,
      };
    } catch (error) {
      await this.minio.deleteImage(uploaded.publicId).catch(() => undefined);
      throw error;
    }
  }

  async getVoiceNote(
    id: string,
    messageId: string,
    userId: string,
    roles: string[],
  ) {
    await this.authorize(id, userId, roles);
    const message = await this.messages.findOne({
      where: { id: messageId, classroomId: id, deletedAt: null },
    });
    if (!message?.audioObjectKey || message.messageType !== 'voice')
      throw new NotFoundException('Voice note not found');
    return {
      buffer: await this.minio.downloadFile(message.audioObjectKey),
      mimeType: message.audioMimeType || 'audio/webm',
      size: message.audioSize,
    };
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

  private async authorizeChat(id: string, userId: string, roles: string[]) {
    const room = await this.authorize(id, userId, roles);
    const role: 'admin' | 'teacher' | 'student' = roles.includes('admin')
      ? 'admin'
      : roles.includes('teacher')
        ? 'teacher'
        : 'student';
    if (role === 'student' && !room.allowStudentChat)
      throw new ForbiddenException(
        'Student chat is disabled for this classroom',
      );
    return role;
  }
}
