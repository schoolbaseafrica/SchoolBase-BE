import { UnauthorizedException } from '@nestjs/common';

import { UserRole } from '../../shared/enums';

import { JwtStrategy } from './jwt.strategy';

jest.mock('../../../config/config', () => ({
  __esModule: true, // eslint-disable-line @typescript-eslint/naming-convention
  default: () => ({ jwt: { secret: 'test-secret' } }),
}));

describe('JwtStrategy account state', () => {
  const teacher = { findOne: jest.fn() };
  const student = { findOne: jest.fn() };
  const parent = { findOne: jest.fn() };
  const users = { findOne: jest.fn() };
  const strategy = new JwtStrategy(
    teacher as never,
    student as never,
    parent as never,
    users as never,
  );
  const token = {
    sub: 'user-id',
    email: 'old@example.com',
    role: [UserRole.ADMIN],
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a deactivated user with an otherwise valid access token', async () => {
    users.findOne.mockResolvedValue({ is_active: false, deleted_at: null });
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses the current database roles and email', async () => {
    users.findOne.mockResolvedValue({
      email: 'new@example.com',
      role: [UserRole.STUDENT],
      is_active: true,
      deleted_at: null,
    });
    student.findOne.mockResolvedValue({ id: 'student-id' });
    await expect(strategy.validate(token)).resolves.toMatchObject({
      email: 'new@example.com',
      roles: [UserRole.STUDENT],
      student_id: 'student-id',
    });
  });
});
