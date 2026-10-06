import { ForbiddenException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { AuthService } from '../auth/auth.service';

import { ParentAccessLinkService } from './parent-access-link.service';

describe('ParentAccessLinkService', () => {
  const parent = {
    id: 'parent-1',
    is_active: true,
    user: { id: 'user-1', is_active: true },
  };
  const repository = { findOne: jest.fn() };
  const query = jest.fn();
  const manager = { query: jest.fn(), findOne: jest.fn() };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repository),
    query,
    transaction: jest.fn((callback: (value: unknown) => unknown) =>
      callback(manager),
    ),
  };
  const auth = { createParentLinkSession: jest.fn() };
  const config = { get: jest.fn() };
  const service = new ParentAccessLinkService(
    dataSource as unknown as DataSource,
    auth as unknown as AuthService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(parent);
    config.get.mockReturnValue('https://demo.schoolbase.africa/');
    query.mockResolvedValue([{ expires_at: new Date('2026-10-06T00:00:00Z') }]);
  });

  it('stores only a hash and returns a bounded link for an active parent', async () => {
    const result = await service.generate('parent-1', 'admin-1', 24, true);
    expect(result.link).toMatch(
      /^https:\/\/demo\.schoolbase\.africa\/parent\/auto-login#/,
    );
    expect(result.email_sent).toBe(false);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO "parent_access_links"');
    expect(params[2]).toMatch(/^[a-f0-9]{64}$/);
    expect(params[2]).not.toBe(result.token);
    expect(params.slice(3)).toEqual(['admin-1', 24, true]);
  });

  it('does not create a link when the frontend URL is absent', async () => {
    config.get.mockReturnValue(undefined);
    await expect(
      service.generate('parent-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [
      'expired',
      { is_active: true, expired: true, is_single_use: true, used_at: null },
    ],
    [
      'revoked',
      { is_active: false, expired: false, is_single_use: true, used_at: null },
    ],
    [
      'used',
      {
        is_active: true,
        expired: false,
        is_single_use: true,
        used_at: new Date(),
      },
    ],
  ])('refuses a %s link without making a session', async (_name, state) => {
    manager.query.mockResolvedValueOnce([
      { id: 'link-1', parent_id: parent.id, ...state },
    ]);
    await expect(service.validate('a'.repeat(43))).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(auth.createParentLinkSession).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('consumes a valid single-use link and returns a parent session', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          id: 'link-1',
          parent_id: parent.id,
          is_active: true,
          expired: false,
          is_single_use: true,
          used_at: null,
        },
      ])
      .mockResolvedValueOnce([]);
    manager.findOne.mockResolvedValue(parent);
    auth.createParentLinkSession.mockResolvedValue({ access_token: 'access' });
    const result = await service.validate('a'.repeat(43), '127.0.0.1');
    expect(result).toEqual({ access_token: 'access' });
    expect(manager.query.mock.calls[1][0]).toContain(
      '"is_active" = CASE WHEN "is_single_use" THEN false',
    );
    expect(manager.query.mock.calls[1][1]).toEqual(['link-1', '127.0.0.1']);
  });
});
