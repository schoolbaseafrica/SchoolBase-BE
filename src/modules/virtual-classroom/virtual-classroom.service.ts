import { spawn } from 'child_process';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';
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
  VirtualClassroomAttendanceEvent,
  VirtualClassroomAttendanceAdjustment,
} from './entities/virtual-classroom.entity';
import {
  CreateVirtualClassroomDto,
  CorrectClassroomAttendanceDto,
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
    @InjectRepository(VirtualClassroomAttendanceEvent)
    private readonly attendanceEvents: Repository<VirtualClassroomAttendanceEvent>,
    @InjectRepository(VirtualClassroomAttendanceAdjustment)
    private readonly attendanceAdjustments: Repository<VirtualClassroomAttendanceAdjustment>,
    private readonly dataSource: DataSource,
    private readonly minio: MinioService,
    private readonly config: ConfigService,
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
        allowStudentMicrophone: false,
        allowStudentCamera: false,
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
        `EXISTS (SELECT 1 FROM students student JOIN class_students cs ON cs.student_id = student.id AND cs.is_active = true WHERE student.user_id = :userId AND cs.class_id = room.class_id AND cs.session_id = CAST(room.session_id AS text))`,
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
    const isReconnect = Boolean(
      active && now.getTime() - active.lastSeenAt.getTime() > 45_000,
    );
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
    if (!active || isReconnect)
      await this.attendanceEvents.save(
        this.attendanceEvents.create({
          classroomId: id,
          userId,
          eventType: isReconnect ? 'reconnect' : 'join',
          occurredAt: now,
        }),
      );
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

  async retireLegacyWhiteboard(id: string, userId: string, roles: string[]) {
    await this.authorize(id, userId, roles);
    if (!roles.includes('admin') && !roles.includes('teacher'))
      throw new ForbiddenException(
        'Only teachers and admins can migrate a legacy whiteboard',
      );
    await this.dataSource.query(
      `UPDATE virtual_classroom_sessions
       SET whiteboard_snapshot = COALESCE(whiteboard_snapshot, '{}'::jsonb) || jsonb_build_object(
             'legacy_canvas_state', COALESCE(
               whiteboard_snapshot->'legacy_canvas_state',
               whiteboard_snapshot->'canvas_state',
               'null'::jsonb
             ),
             'canvas_state', 'null'::jsonb
           ),
           whiteboard_version = whiteboard_version + 1
       WHERE id = $1`,
      [id],
    );
    return { migrated: true };
  }

  async leave(id: string, userId: string) {
    const active = await this.participants.findOne({
      where: { classroomId: id, userId, leftAt: null },
    });
    if (active) {
      active.leftAt = new Date();
      active.lastSeenAt = active.leftAt;
      await this.participants.save(active);
      await this.attendanceEvents.save(
        this.attendanceEvents.create({
          classroomId: id,
          userId,
          eventType: 'leave',
          occurredAt: active.leftAt,
        }),
      );
    }
    return { left: Boolean(active) };
  }

  async getAttendanceReview(id: string, userId: string, roles: string[]) {
    const room = await this.authorize(id, userId, roles);
    if (!roles.includes('admin') && !roles.includes('teacher'))
      throw new ForbiddenException('Classroom attendance is restricted');
    const rows = (await this.dataSource.query(
      `SELECT student.id AS "studentId", app_user.id AS "userId",
              concat_ws(' ', app_user.first_name, app_user.last_name) AS name,
              student.registration_number AS "registrationNumber"
       FROM class_students enrollment
       JOIN students student ON student.id = enrollment.student_id
       JOIN users app_user ON app_user.id = student.user_id
       WHERE enrollment.class_id = $1 AND enrollment.session_id = $2
         AND enrollment.is_active = true AND student.is_deleted = false
       ORDER BY app_user.first_name, app_user.last_name`,
      [room.classId, room.sessionId],
    )) as Array<{
      studentId: string;
      userId: string;
      name: string;
      registrationNumber: string;
    }>;
    const userIds = rows.map((row) => row.userId);
    const visits = userIds.length
      ? ((await this.dataSource.query(
          `SELECT user_id AS "userId", MIN(joined_at) AS "firstJoin",
                  MAX(last_seen_at) AS "lastActivity",
                  SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(left_at, last_seen_at) - joined_at))))::int AS "connectedSeconds",
                  GREATEST(COUNT(*)::int - 1, 0) AS "visitReconnects"
           FROM virtual_classroom_participants
           WHERE classroom_id = $1 AND role = 'student' AND user_id = ANY($2::uuid[])
           GROUP BY user_id`,
          [id, userIds],
        )) as Array<{
          userId: string;
          firstJoin: string;
          lastActivity: string;
          connectedSeconds: number;
          visitReconnects: number;
        }>)
      : [];
    const eventCounts = userIds.length
      ? ((await this.dataSource.query(
          `SELECT user_id AS "userId", COUNT(*)::int AS count
           FROM virtual_classroom_attendance_events
           WHERE classroom_id = $1 AND event_type = 'reconnect' AND user_id = ANY($2::uuid[])
           GROUP BY user_id`,
          [id, userIds],
        )) as Array<{ userId: string; count: number }>)
      : [];
    const adjustments = userIds.length
      ? ((await this.dataSource.query(
          `SELECT DISTINCT ON (adjustment.student_user_id)
                  adjustment.student_user_id AS "userId", adjustment.status,
                  adjustment.reason, adjustment.corrected_by AS "correctedBy",
                  adjustment.created_at AS "correctedAt",
                  concat_ws(' ', app_user.first_name, app_user.last_name) AS "correctedByName"
           FROM virtual_classroom_attendance_adjustments adjustment
           JOIN users app_user ON app_user.id = adjustment.corrected_by
           WHERE adjustment.classroom_id = $1 AND adjustment.student_user_id = ANY($2::uuid[])
           ORDER BY adjustment.student_user_id, adjustment.created_at DESC`,
          [id, userIds],
        )) as Array<{
          userId: string;
          status: 'present' | 'late' | 'partial' | 'absent';
          reason: string;
          correctedBy: string;
          correctedAt: string;
          correctedByName: string;
        }>)
      : [];
    const visitMap = new Map(visits.map((visit) => [visit.userId, visit]));
    const eventMap = new Map(
      eventCounts.map((event) => [event.userId, event.count]),
    );
    const adjustmentMap = new Map(
      adjustments.map((adjustment) => [adjustment.userId, adjustment]),
    );
    const startsAt = new Date(room.startsAt).getTime();
    const endsAt = new Date(room.endsAt).getTime();
    const effectiveEnd =
      room.status === 'ended' ? endsAt : Math.min(Date.now(), endsAt);
    const lessonSeconds = Math.max(
      1,
      Math.floor((effectiveEnd - startsAt) / 1000),
    );
    const students = rows.map((student) => {
      const visit = visitMap.get(student.userId);
      const connectedSeconds = Number(visit?.connectedSeconds ?? 0);
      let derivedStatus: 'present' | 'late' | 'partial' | 'absent' = 'absent';
      if (visit) {
        const late =
          new Date(visit.firstJoin).getTime() > startsAt + 10 * 60_000;
        derivedStatus =
          connectedSeconds < lessonSeconds * 0.5
            ? 'partial'
            : late
              ? 'late'
              : 'present';
      }
      const adjustment = adjustmentMap.get(student.userId) ?? null;
      return {
        ...student,
        firstJoin: visit?.firstJoin ?? null,
        lastActivity: visit?.lastActivity ?? null,
        connectedSeconds,
        reconnectCount: Math.max(
          Number(visit?.visitReconnects ?? 0),
          Number(eventMap.get(student.userId) ?? 0),
        ),
        derivedStatus,
        status: adjustment?.status ?? derivedStatus,
        adjustment,
      };
    });
    return {
      classroom: {
        id: room.id,
        title: room.title,
        status: room.status,
        sessionId: room.sessionId,
        termId: room.termId,
        startsAt: room.startsAt,
        endsAt: room.endsAt,
      },
      thresholds: { lateAfterMinutes: 10, partialBelowPercent: 50 },
      summary: {
        total: students.length,
        present: students.filter((item) => item.status === 'present').length,
        late: students.filter((item) => item.status === 'late').length,
        partial: students.filter((item) => item.status === 'partial').length,
        absent: students.filter((item) => item.status === 'absent').length,
      },
      students,
    };
  }

  async correctAttendance(
    id: string,
    studentUserId: string,
    dto: CorrectClassroomAttendanceDto,
    userId: string,
    roles: string[],
  ) {
    const review = await this.getAttendanceReview(id, userId, roles);
    const student = review.students.find(
      (item) => item.userId === studentUserId,
    );
    if (!student)
      throw new NotFoundException('Student is not enrolled in this classroom');
    const reason = dto.reason.trim();
    if (!reason)
      throw new BadRequestException('A correction reason is required');
    const adjustment = await this.attendanceAdjustments.save(
      this.attendanceAdjustments.create({
        classroomId: id,
        studentUserId,
        status: dto.status,
        reason,
        correctedBy: userId,
      }),
    );
    await this.dataSource.query(
      `INSERT INTO activity_logs (user_id, entity_type, entity_id, action, description, metadata)
       VALUES ($1, 'CLASSROOM_ATTENDANCE', $2, 'UPDATE', 'Classroom attendance status corrected', $3::jsonb)`,
      [
        userId,
        id,
        JSON.stringify({
          studentUserId,
          previousStatus: student.status,
          derivedStatus: student.derivedStatus,
          status: dto.status,
          reason,
        }),
      ],
    );
    return adjustment;
  }

  async getMessages(id: string, userId: string, roles: string[]) {
    await this.authorize(id, userId, roles);
    const messages = await this.messages.find({
      where: { classroomId: id, deletedAt: null },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    const senderIds = [...new Set(messages.map((message) => message.senderId))];
    const senders = senderIds.length
      ? ((await this.dataSource.query(
          `SELECT id, first_name AS "firstName", last_name AS "lastName"
           FROM users WHERE id = ANY($1::uuid[])`,
          [senderIds],
        )) as Array<{ id: string; firstName: string; lastName: string }>)
      : [];
    const senderNames = new Map(
      senders.map((sender) => [
        sender.id,
        [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim(),
      ]),
    );
    return messages.map((message) => ({
      ...message,
      senderName: senderNames.get(message.senderId) || null,
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

    const normalizedBuffer = await this.transcodeVoiceNote(file.buffer);
    const normalizedFile: IMulterFile = {
      ...file,
      originalname: `${file.originalname.replace(/\.[^.]+$/, '')}.mp3`,
      mimetype: 'audio/mpeg',
      size: normalizedBuffer.length,
      buffer: normalizedBuffer,
    };
    const uploaded = await this.minio.uploadFile(
      normalizedFile,
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
          audioMimeType: normalizedFile.mimetype,
          audioSize: normalizedFile.size,
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

  async uploadWhiteboardImage(
    id: string,
    file: IMulterFile,
    userId: string,
    roles: string[],
  ) {
    await this.authorize(id, userId, roles);
    if (!roles.includes('admin') && !roles.includes('teacher'))
      throw new ForbiddenException(
        'Only teachers can upload whiteboard images',
      );
    if (!file) throw new BadRequestException('Choose an image to upload');
    return this.minio.uploadImage(file, `classrooms/${id}/whiteboard`);
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
    let buffer = await this.minio.downloadFile(message.audioObjectKey);
    let mimeType = message.audioMimeType || 'audio/webm';
    if (mimeType !== 'audio/mpeg') {
      buffer = await this.transcodeVoiceNote(buffer);
      mimeType = 'audio/mpeg';
      await this.minio.replaceFile(message.audioObjectKey, buffer);
      message.audioMimeType = mimeType;
      message.audioSize = buffer.length;
      await this.messages.save(message);
    }
    return { buffer, mimeType, size: buffer.length };
  }

  private transcodeVoiceNote(input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const process = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '24000',
        '-b:a',
        '48k',
        '-f',
        'mp3',
        'pipe:1',
      ]);
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      const timeout = setTimeout(() => {
        process.kill('SIGKILL');
        reject(
          new ServiceUnavailableException('Voice note processing timed out'),
        );
      }, 15_000);
      process.stdout.on('data', (chunk: Buffer) => output.push(chunk));
      process.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      process.on('error', () => {
        clearTimeout(timeout);
        reject(
          new ServiceUnavailableException(
            'Voice note processing is unavailable',
          ),
        );
      });
      process.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 || !output.length) {
          const detail = Buffer.concat(errors).toString().trim();
          reject(
            new BadRequestException(
              detail
                ? `Voice note could not be decoded: ${detail.slice(0, 160)}`
                : 'Voice note could not be decoded',
            ),
          );
          return;
        }
        resolve(Buffer.concat(output));
      });
      process.stdin.on('error', () => undefined);
      process.stdin.end(input);
    });
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
    const saved = await this.sessions.save(room);
    if (
      dto.allowStudentMicrophone !== undefined ||
      dto.allowStudentCamera !== undefined
    )
      await this.syncStudentMediaPermissions(saved);
    return saved;
  }

  async createMediaToken(id: string, userId: string, roles: string[]) {
    const room = await this.authorize(id, userId, roles);
    if (room.status !== 'live')
      throw new BadRequestException(
        'Live audio is available only while the classroom is live',
      );
    const settings = this.liveKitSettings();
    if (!settings)
      throw new ServiceUnavailableException(
        'Live classroom audio is not configured yet',
      );
    const role: 'admin' | 'teacher' | 'student' = roles.includes('admin')
      ? 'admin'
      : roles.includes('teacher')
        ? 'teacher'
        : 'student';
    const publishSources =
      role === 'student'
        ? [
            ...(room.allowStudentMicrophone ? [TrackSource.MICROPHONE] : []),
            ...(room.allowStudentCamera ? [TrackSource.CAMERA] : []),
          ]
        : [
            TrackSource.MICROPHONE,
            TrackSource.CAMERA,
            TrackSource.SCREEN_SHARE,
            TrackSource.SCREEN_SHARE_AUDIO,
          ];
    const canPublish = publishSources.length > 0;
    const users = (await this.dataSource.query(
      `SELECT concat_ws(' ', first_name, last_name) AS name FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )) as Array<{ name: string }>;
    const name = users[0]?.name?.trim() || 'Classroom participant';
    const token = new AccessToken(settings.apiKey, settings.apiSecret, {
      identity: userId,
      name,
      ttl: '2h',
      metadata: JSON.stringify({ role, classroomId: id }),
    });
    token.addGrant({
      roomJoin: true,
      room: this.mediaRoomName(id),
      canSubscribe: true,
      canPublish,
      canPublishData: false,
      canPublishSources: publishSources,
    });
    return {
      token: await token.toJwt(),
      url: settings.url,
      roomName: this.mediaRoomName(id),
      canPublish,
      allowStudentMicrophone: room.allowStudentMicrophone,
      allowStudentCamera: room.allowStudentCamera,
      expiresInSeconds: 7200,
    };
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

  private async syncStudentMediaPermissions(room: VirtualClassroomSession) {
    const settings = this.liveKitSettings();
    if (!settings) return;
    const client = new RoomServiceClient(
      settings.apiUrl,
      settings.apiKey,
      settings.apiSecret,
    );
    const roomName = this.mediaRoomName(room.id);
    let participants;
    try {
      participants = await client.listParticipants(roomName);
    } catch {
      return;
    }
    await Promise.all(
      participants.map(async (participant) => {
        let role = '';
        try {
          role = JSON.parse(participant.metadata || '{}').role as string;
        } catch {
          role = '';
        }
        if (role !== 'student') return;
        const sources = [
          ...(room.allowStudentMicrophone ? [TrackSource.MICROPHONE] : []),
          ...(room.allowStudentCamera ? [TrackSource.CAMERA] : []),
        ];
        await client.updateParticipant(roomName, participant.identity, {
          permission: {
            canSubscribe: true,
            canPublish: sources.length > 0,
            canPublishData: false,
            canPublishSources: sources,
          },
        });
      }),
    );
  }

  private mediaRoomName(classroomId: string) {
    return `schoolbase-classroom-${classroomId}`;
  }

  private liveKitSettings() {
    const url = this.config.get<string>('livekit.url');
    const apiKey = this.config.get<string>('livekit.apiKey');
    const apiSecret = this.config.get<string>('livekit.apiSecret');
    const configuredApiUrl = this.config.get<string>('livekit.apiUrl');
    if (!url || !apiKey || !apiSecret) return null;
    const apiUrl = (configuredApiUrl || url)
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');
    return { url, apiUrl, apiKey, apiSecret };
  }
}
