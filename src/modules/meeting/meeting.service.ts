import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';
import { DataSource } from 'typeorm';

import { CreateMeetingDto } from './meeting.dto';

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  createdBy: string;
  audienceRoles: string[];
  audienceUserIds: string[];
  audienceClassIds: string[];
};

@Injectable()
export class MeetingService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  private readonly select = `SELECT id, title, description, starts_at AS "startsAt", ends_at AS "endsAt",
    status, created_by AS "createdBy", audience_roles AS "audienceRoles",
    audience_user_ids AS "audienceUserIds", audience_class_ids AS "audienceClassIds" FROM meetings`;

  private async closeExpired() {
    const ended = (await this.db
      .query(`UPDATE meetings SET status = 'ended', updated_at = now()
      WHERE status IN ('scheduled', 'live') AND ends_at <= now() RETURNING id`)) as Array<{
      id: string;
    }>;
    const settings = this.liveKitSettings();
    if (!settings) return;
    const client = new RoomServiceClient(
      settings.apiUrl,
      settings.apiKey,
      settings.apiSecret,
    );
    await Promise.all(
      ended.map(async ({ id }) => {
        try {
          await client.deleteRoom(`schoolbase-meeting-${id}`);
        } catch {
          /* Room may already be closed. */
        }
      }),
    );
  }

  private async eligible(meeting: Meeting, userId: string, roles: string[]) {
    if (meeting.createdBy === userId && roles.includes('ADMIN')) return true;
    if (meeting.audienceUserIds.includes(userId)) return true;
    if (meeting.audienceRoles.some((role) => roles.includes(role))) return true;
    if (!meeting.audienceClassIds.length) return false;
    const rows = await this.db.query(
      `SELECT 1 FROM class_students cs
      JOIN students s ON s.id = cs.student_id
      JOIN class c ON c.id = cs.class_id
      WHERE s.user_id = $1 AND cs.class_id = ANY($2::uuid[]) AND cs.is_active = true
        AND s.is_deleted = false AND c.is_deleted = false AND cs.session_id = c.academic_session_id::text
      UNION SELECT 1 FROM class_students cs
      JOIN students s ON s.id = cs.student_id
      JOIN parents p ON p.id = s.parent_id
      JOIN class c ON c.id = cs.class_id
      WHERE p.user_id = $1 AND cs.class_id = ANY($2::uuid[]) AND cs.is_active = true
        AND p.is_active = true AND s.is_deleted = false AND c.is_deleted = false
        AND cs.session_id = c.academic_session_id::text
      UNION SELECT 1 FROM class_teachers ct
      JOIN teachers t ON t.id = ct.teacher_id
      JOIN class c ON c.id = ct.class_id
      WHERE t.user_id = $1 AND ct.class_id = ANY($2::uuid[]) AND ct.is_active = true
        AND t.is_active = true AND c.is_deleted = false AND ct.session_id = c.academic_session_id::text
      LIMIT 1`,
      [userId, meeting.audienceClassIds],
    );
    return rows.length > 0;
  }

  async create(dto: CreateMeetingDto, userId: string) {
    const start = new Date(dto.startsAt),
      end = new Date(dto.endsAt);
    if (
      !Number.isFinite(start.valueOf()) ||
      !Number.isFinite(end.valueOf()) ||
      end <= start ||
      end <= new Date()
    )
      throw new BadRequestException(
        'Meeting end must be after its start and in the future',
      );
    if (end.valueOf() - start.valueOf() > 24 * 60 * 60 * 1000)
      throw new BadRequestException('A meeting may last at most 24 hours');
    if (
      !dto.audienceRoles.length &&
      !dto.audienceUserIds.length &&
      !dto.audienceClassIds.length
    )
      throw new BadRequestException('Select at least one audience');
    const userIds = [...new Set(dto.audienceUserIds)];
    const classIds = [...new Set(dto.audienceClassIds)];
    if (userIds.length) {
      const found = await this.db.query(
        `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active = true AND deleted_at IS NULL`,
        [userIds],
      );
      if (found.length !== userIds.length)
        throw new BadRequestException('An invited user is unavailable');
    }
    if (classIds.length) {
      const found = await this.db.query(
        `SELECT id FROM class WHERE id = ANY($1::uuid[]) AND is_deleted = false`,
        [classIds],
      );
      if (found.length !== classIds.length)
        throw new BadRequestException('An invited class is unavailable');
    }
    const rows = await this.db.query(
      `INSERT INTO meetings (title, description, starts_at, ends_at, created_by,
      audience_roles, audience_user_ids, audience_class_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        dto.title.trim(),
        dto.description?.trim() || null,
        start,
        end,
        userId,
        [...new Set(dto.audienceRoles)],
        userIds,
        classIds,
      ],
    );
    return this.get(rows[0].id, userId, ['ADMIN']);
  }

  async invitees(query: string) {
    const term = query.trim();
    if (term.length < 2) return { users: [], classes: [] };
    const users = await this.db.query(
      `SELECT id, concat_ws(' ', first_name, last_name) AS name,
      email, role FROM users WHERE is_active = true AND deleted_at IS NULL
      AND (concat_ws(' ', first_name, last_name) ILIKE $1 OR email ILIKE $1)
      ORDER BY first_name, last_name LIMIT 30`,
      [`%${term}%`],
    );
    const classes = await this.db.query(
      `SELECT id, concat_ws(' ', name, arm) AS name FROM class
      WHERE is_deleted = false AND concat_ws(' ', name, arm) ILIKE $1
      ORDER BY name, arm LIMIT 30`,
      [`%${term}%`],
    );
    return { users, classes };
  }

  async list(userId: string, roles: string[]) {
    await this.closeExpired();
    const meetings = (await this.db.query(
      `${this.select} WHERE ends_at > now() - interval '30 days' ORDER BY starts_at DESC LIMIT 200`,
    )) as Meeting[];
    const visible = await Promise.all(
      meetings.map(async (meeting) =>
        (await this.eligible(meeting, userId, roles)) ? meeting : null,
      ),
    );
    return visible.filter(Boolean).map((meeting) => {
      if (meeting!.createdBy === userId && roles.includes('ADMIN'))
        return meeting;
      return { ...meeting, audienceUserIds: [], audienceClassIds: [] };
    });
  }

  async get(id: string, userId: string, roles: string[]) {
    await this.closeExpired();
    const rows = (await this.db.query(`${this.select} WHERE id = $1`, [
      id,
    ])) as Meeting[];
    const meeting = rows[0];
    if (!meeting || !(await this.eligible(meeting, userId, roles)))
      throw new NotFoundException('Meeting not found');
    if (meeting.createdBy === userId && roles.includes('ADMIN')) return meeting;
    const { audienceUserIds, audienceClassIds, ...publicMeeting } = meeting;
    void audienceUserIds;
    void audienceClassIds;
    return { ...publicMeeting, audienceUserIds: [], audienceClassIds: [] };
  }

  async requestAdmission(id: string, userId: string, roles: string[]) {
    const meeting = await this.get(id, userId, roles);
    if (meeting.status === 'ended' || meeting.status === 'cancelled')
      throw new BadRequestException('Meeting is closed');
    if (meeting.createdBy === userId && roles.includes('ADMIN'))
      return { status: 'admitted' };
    if (
      meeting.status !== 'live' ||
      new Date() < new Date(meeting.startsAt) ||
      new Date() >= new Date(meeting.endsAt)
    )
      throw new BadRequestException('Meeting is not open for admission');
    await this.db.query(
      `INSERT INTO meeting_admissions (meeting_id, user_id) VALUES ($1,$2)
      ON CONFLICT (meeting_id, user_id) DO NOTHING`,
      [id, userId],
    );
    const rows = await this.db.query(
      `SELECT status FROM meeting_admissions WHERE meeting_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0];
  }

  async admissionStatus(id: string, userId: string, roles: string[]) {
    const meeting = await this.get(id, userId, roles);
    if (meeting.createdBy === userId && roles.includes('ADMIN')) {
      return this.db.query(
        `SELECT a.user_id AS "userId", a.status, concat_ws(' ', u.first_name, u.last_name) AS name
        FROM meeting_admissions a JOIN users u ON u.id = a.user_id WHERE a.meeting_id = $1 ORDER BY a.requested_at`,
        [id],
      );
    }
    const rows = await this.db.query(
      `SELECT status FROM meeting_admissions WHERE meeting_id = $1 AND user_id = $2`,
      [id, userId],
    );
    return { status: rows[0]?.status || 'none' };
  }

  async decideAdmission(
    id: string,
    participantId: string,
    status: 'admitted' | 'denied',
    userId: string,
  ) {
    const meeting = await this.get(id, userId, ['ADMIN']);
    if (meeting.createdBy !== userId)
      throw new ForbiddenException('Only the host can admit participants');
    const rows = await this.db.query(
      `UPDATE meeting_admissions SET status = $3, decided_at = now()
      WHERE meeting_id = $1 AND user_id = $2 RETURNING user_id`,
      [id, participantId, status],
    );
    if (!rows.length)
      throw new NotFoundException('Admission request not found');
    if (status === 'denied') {
      const settings = this.liveKitSettings();
      if (settings) {
        try {
          await new RoomServiceClient(
            settings.apiUrl,
            settings.apiKey,
            settings.apiSecret,
          ).removeParticipant(`schoolbase-meeting-${id}`, participantId);
        } catch {
          /* Participant may not be connected. */
        }
      }
    }
    return { status };
  }

  async muteParticipant(id: string, participantId: string, userId: string) {
    const meeting = await this.get(id, userId, ['ADMIN']);
    if (meeting.createdBy !== userId)
      throw new ForbiddenException('Only the host can mute participants');
    if (meeting.status !== 'live')
      throw new BadRequestException('Meeting is not live');
    if (participantId === userId)
      throw new BadRequestException('Use your own microphone control');
    const settings = this.liveKitSettings();
    if (!settings)
      throw new ServiceUnavailableException('Live meetings are not configured');
    const client = new RoomServiceClient(
      settings.apiUrl,
      settings.apiKey,
      settings.apiSecret,
    );
    const name = `schoolbase-meeting-${id}`;
    const participant = (await client.listParticipants(name)).find(
      (item) => item.identity === participantId,
    );
    if (!participant)
      throw new NotFoundException('Participant is not connected');
    const microphone = participant.tracks.find(
      (track) => track.source === TrackSource.MICROPHONE,
    );
    if (!microphone)
      throw new NotFoundException('Participant microphone is off');
    await client.mutePublishedTrack(name, participantId, microphone.sid, true);
    return { muted: true };
  }

  async setStatus(
    id: string,
    status: 'live' | 'ended' | 'cancelled',
    userId: string,
  ) {
    const rows = (await this.db.query(`${this.select} WHERE id = $1`, [
      id,
    ])) as Meeting[];
    const meeting = rows[0];
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.createdBy !== userId)
      throw new ForbiddenException(
        'Only the meeting host can change its status',
      );
    if (meeting.status === 'ended' || meeting.status === 'cancelled')
      throw new BadRequestException('Meeting is closed');
    if (status === 'live' && new Date(meeting.endsAt) <= new Date())
      throw new BadRequestException('Meeting window has ended');
    if (status === 'cancelled' && meeting.status === 'live')
      throw new BadRequestException('End a live meeting instead');
    await this.db.query(
      `UPDATE meetings SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    if (status !== 'live') {
      const settings = this.liveKitSettings();
      if (settings) {
        try {
          await new RoomServiceClient(
            settings.apiUrl,
            settings.apiKey,
            settings.apiSecret,
          ).deleteRoom(`schoolbase-meeting-${id}`);
        } catch {
          /* Room may never have been opened. Tokens are rejected by status checks. */
        }
      }
    }
    return this.get(id, userId, ['ADMIN']);
  }

  async mediaToken(id: string, userId: string, roles: string[]) {
    const meeting = await this.get(id, userId, roles);
    const host = meeting.createdBy === userId && roles.includes('ADMIN');
    if (meeting.status !== 'live' && !(host && meeting.status === 'scheduled'))
      throw new ForbiddenException('Meeting is not open');
    if (
      !host &&
      (new Date() < new Date(meeting.startsAt) ||
        new Date() >= new Date(meeting.endsAt))
    )
      throw new ForbiddenException('Meeting is outside its scheduled time');
    if (!host) {
      const admission = await this.db.query(
        `SELECT status FROM meeting_admissions WHERE meeting_id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (admission[0]?.status !== 'admitted')
        throw new ForbiddenException('Wait for the host to admit you');
    }
    const settings = this.liveKitSettings();
    if (!settings)
      throw new ServiceUnavailableException('Live meetings are not configured');
    const users = await this.db.query(
      `SELECT concat_ws(' ', first_name, last_name) AS name FROM users WHERE id = $1`,
      [userId],
    );
    const token = new AccessToken(settings.apiKey, settings.apiSecret, {
      identity: userId,
      name: users[0]?.name?.trim() || 'Participant',
      ttl: '1m',
      metadata: JSON.stringify({ meetingId: id, host }),
    });
    token.addGrant({
      roomJoin: true,
      room: `schoolbase-meeting-${id}`,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    });
    return { token: await token.toJwt(), url: settings.url, host };
  }

  private liveKitSettings() {
    const url = this.config.get<string>('livekit.url');
    const apiKey = this.config.get<string>('livekit.apiKey');
    const apiSecret = this.config.get<string>('livekit.apiSecret');
    if (!url || !apiKey || !apiSecret) return null;
    return {
      url,
      apiKey,
      apiSecret,
      apiUrl: (this.config.get<string>('livekit.apiUrl') || url)
        .replace(/^wss:/, 'https:')
        .replace(/^ws:/, 'http:'),
    };
  }
}
