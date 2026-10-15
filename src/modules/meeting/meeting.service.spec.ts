import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { MeetingService } from './meeting.service';

const id = '11111111-1111-4111-8111-111111111111';
const host = '22222222-2222-4222-8222-222222222222';
const invitee = '33333333-3333-4333-8333-333333333333';
const outsider = '44444444-4444-4444-8444-444444444444';

describe('Meeting access', () => {
  const meeting = {
    id,
    title: 'Staff briefing',
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 3_600_000),
    status: 'live',
    createdBy: host,
    audienceRoles: [],
    audienceUserIds: [invitee],
    audienceClassIds: [],
  };
  let query: jest.Mock;
  let service: MeetingService;

  beforeEach(() => {
    query = jest.fn(async (sql: string) => {
      if (sql.includes('UPDATE meetings SET status')) return [];
      if (sql.includes('FROM meetings')) return [meeting];
      if (sql.includes('FROM meeting_admissions')) return [];
      return [];
    });
    service = new MeetingService(
      { query } as unknown as DataSource,
      { get: () => undefined } as unknown as ConfigService,
    );
  });

  it('hides meetings and invitation IDs from anyone not invited', async () => {
    await expect(service.get(id, outsider, ['TEACHER'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.list(outsider, ['TEACHER'])).toEqual([]);
    expect(
      (await service.get(id, invitee, ['TEACHER'])).audienceUserIds,
    ).toEqual([]);
    expect((await service.get(id, host, ['ADMIN'])).audienceUserIds).toEqual([
      invitee,
    ]);
    await expect(service.get(id, host, ['TEACHER'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires host admission before issuing media credentials', async () => {
    await expect(
      service.mediaToken(id, invitee, ['TEACHER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT concat_ws'),
      expect.anything(),
    );
  });

  it('allows only the creator to change status', async () => {
    await expect(
      service.setStatus(id, 'ended', outsider),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE meetings SET status = $2'),
      expect.anything(),
    );
  });

  it('does not allow an uninvited user to request admission', async () => {
    await expect(
      service.requestAdmission(id, outsider, ['TEACHER']),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO meeting_admissions'),
      expect.anything(),
    );
  });

  it('requires an audience when creating a meeting', async () => {
    await expect(
      service.create(
        {
          title: 'Briefing',
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 120_000).toISOString(),
          audienceRoles: [],
          audienceUserIds: [],
          audienceClassIds: [],
        },
        host,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
