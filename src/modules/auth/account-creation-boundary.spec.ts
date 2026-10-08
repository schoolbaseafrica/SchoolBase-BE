import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { InitialSetupGuard } from '../../common/guards/initial-setup.guard';
import { InvitesController } from '../invites/invites.controller';
import { InviteService } from '../invites/invites.service';
import { UserController } from '../user/user.controller';
import { UserService } from '../user/user.service';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

describe('Account creation HTTP boundary', () => {
  let app: INestApplication;
  const signup = jest.fn();
  const createUser = jest.fn();
  const inviteUser = jest.fn();
  const acceptInvite = jest.fn().mockResolvedValue({ id: 'invited-user' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, UserController, InvitesController],
      providers: [
        { provide: AuthService, useValue: { signup } },
        { provide: UserService, useValue: { create: createUser } },
        { provide: InviteService, useValue: { inviteUser, acceptInvite } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(InitialSetupGuard)
      .useValue({ canActivate: () => false })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not expose direct signup or user creation', async () => {
    const signupResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ email: 'outsider@example.com', password: 'Password123!' });
    const userResponse = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ email: 'outsider@example.com', password: 'Password123!' });

    expect(signupResponse.status).toBe(404);
    expect(userResponse.status).toBe(404);
    expect(signup).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('does not expose public account activation', async () => {
    const response = await request(app.getHttpServer()).patch(
      '/api/v1/auth/users/00000000-0000-0000-0000-000000000001/activate',
    );
    expect(response.status).toBe(404);
  });

  it('requires authentication to issue an invitation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/invites')
      .send({
        email: 'new-admin@example.com',
        role: 'ADMIN',
        full_name: 'New Admin',
      });

    expect(response.status).toBe(403);
    expect(inviteUser).not.toHaveBeenCalled();
  });

  it('allows the recipient to redeem an invitation token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/invites/accept')
      .send({ token: 'valid-invite-token', password: 'Password123!' });

    expect(response.status).toBe(201);
    expect(acceptInvite).toHaveBeenCalledWith({
      token: 'valid-invite-token',
      password: 'Password123!',
    });
  });

  it('does not expose the first-admin invitation without setup authority', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/invites/bootstrap-admin')
      .send({ email: 'first-admin@example.com' });
    expect(response.status).toBe(403);
  });

  it('does not expose admin deletion and protects admin details and first-owner assignment', async () => {
    const deleteResponse = await request(app.getHttpServer()).delete(
      '/api/v1/users/00000000-0000-4000-8000-000000000001',
    );
    const detailResponse = await request(app.getHttpServer()).get(
      '/api/v1/users/00000000-0000-4000-8000-000000000001',
    );
    const ownerResponse = await request(app.getHttpServer())
      .post('/api/v1/users/owner')
      .send({ owner_user_id: '00000000-0000-4000-8000-000000000001' });

    expect(deleteResponse.status).toBe(404);
    expect(detailResponse.status).toBe(403);
    expect(ownerResponse.status).toBe(403);
  });
});
