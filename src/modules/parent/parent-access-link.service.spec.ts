import { ForbiddenException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
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

  it('labels a new parent link as requiring password setup', async () => {
    repository.findOne.mockResolvedValue({
      ...parent,
      user: { ...parent.user, password_setup_required: true },
    });
    await expect(
      service.generate('parent-1', 'admin-1'),
    ).resolves.toMatchObject({
      requires_password_reset: true,
    });
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

  it('holds a first-use link for password setup without issuing a session', async () => {
    manager.query.mockResolvedValueOnce([
      {
        id: 'link-1',
        parent_id: parent.id,
        is_active: true,
        expired: false,
        is_single_use: true,
        used_at: null,
      },
    ]);
    manager.findOne.mockResolvedValue({
      ...parent,
      user: {
        ...parent.user,
        first_name: 'Ada',
        last_name: 'Parent',
        password_setup_required: true,
      },
    });

    await expect(service.validate('a'.repeat(43))).resolves.toEqual({
      user: { first_name: 'Ada', last_name: 'Parent' },
      requires_password_reset: true,
    });
    expect(auth.createParentLinkSession).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('does not treat a later forgot-password token as first-use setup', async () => {
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
    manager.findOne.mockResolvedValue({
      ...parent,
      user: {
        ...parent.user,
        reset_token: 'later-reset',
        password_setup_required: false,
      },
    });
    auth.createParentLinkSession.mockResolvedValue({ access_token: 'access' });
    await expect(service.validate('a'.repeat(43))).resolves.toEqual({
      access_token: 'access',
    });
  });

  it('sets the first password, consumes the link and signs the parent in', async () => {
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
      .mockResolvedValueOnce([{ password_setup_required: true }])
      .mockResolvedValue([]);
    manager.findOne.mockResolvedValue({
      ...parent,
      user: {
        ...parent.user,
        email: 'parent@example.com',
        role: ['PARENT'],
      },
    });
    auth.createParentLinkSession.mockResolvedValue({ access_token: 'access' });

    await expect(
      service.completeSetup('a'.repeat(43), 'NewPassword123', '127.0.0.1'),
    ).resolves.toEqual({ access_token: 'access' });
    expect(manager.query.mock.calls[2][0]).toContain(
      '"password_setup_required" = false',
    );
    expect(
      await bcrypt.compare('NewPassword123', manager.query.mock.calls[2][1][0]),
    ).toBe(true);
    expect(manager.query.mock.calls[3][0]).toContain('"is_active" = false');
    expect(auth.createParentLinkSession).toHaveBeenCalledTimes(1);
  });

  it('does not repeat password setup after it was completed', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          id: 'link-1',
          parent_id: parent.id,
          is_active: true,
          expired: false,
          is_single_use: false,
          used_at: null,
        },
      ])
      .mockResolvedValueOnce([{ password_setup_required: false }]);
    manager.findOne.mockResolvedValue(parent);
    await expect(
      service.completeSetup('a'.repeat(43), 'NewPassword123'),
    ).rejects.toBeInstanceOf(GoneException);
    expect(auth.createParentLinkSession).not.toHaveBeenCalled();
  });

  it('does not set a password through an expired magic link', async () => {
    manager.query.mockResolvedValueOnce([
      {
        id: 'link-1',
        parent_id: parent.id,
        is_active: true,
        expired: true,
        is_single_use: true,
        used_at: null,
      },
    ]);
    await expect(
      service.completeSetup('a'.repeat(43), 'NewPassword123'),
    ).rejects.toBeInstanceOf(GoneException);
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(auth.createParentLinkSession).not.toHaveBeenCalled();
  });
});
