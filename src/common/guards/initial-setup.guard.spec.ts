import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { SchoolSettingsService } from '../../modules/school/school-settings.service';
import { SchoolController } from '../../modules/school/school.controller';
import { SchoolService } from '../../modules/school/school.service';
import { SuperadminController } from '../../modules/superadmin/superadmin.controller';
import { SuperadminService } from '../../modules/superadmin/superadmin.service';

import { InitialSetupGuard } from './initial-setup.guard';
import { RateLimitGuard } from './rate-limit.guard';

describe('Initial setup HTTP boundary', () => {
  const setupSecret = 'a'.repeat(48);
  const createSuperAdmin = jest.fn().mockResolvedValue({ id: 'admin-1' });
  const processInstallation = jest.fn().mockResolvedValue({ id: 'school-1' });
  let app: INestApplication;
  let configuredSecret: string | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SuperadminController, SchoolController],
      providers: [
        InitialSetupGuard,
        { provide: ConfigService, useValue: { get: () => configuredSecret } },
        { provide: SuperadminService, useValue: { createSuperAdmin } },
        { provide: SchoolService, useValue: { processInstallation } },
        { provide: SchoolSettingsService, useValue: {} },
        { provide: RateLimitGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    configuredSecret = setupSecret;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const superadminPayload = {
    email: 'admin@example.invalid',
    first_name: 'First',
    last_name: 'Admin',
    school_name: 'New School',
    password: 'Password123!',
    confirm_password: 'Password123!',
  };

  it('refuses superadmin creation without the secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/superadmin')
      .send(superadminPayload);
    expect(response.status).toBe(403);
    expect(createSuperAdmin).not.toHaveBeenCalled();
  });

  it('refuses school installation with an invalid secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/school/installation')
      .set('X-Initial-Setup-Secret', 'wrong')
      .field('name', 'New School')
      .field('address', '123 School Road')
      .field('email', 'school@example.invalid')
      .field('phone', '+123456789');
    expect(response.status).toBe(403);
    expect(processInstallation).not.toHaveBeenCalled();
  });

  it('accepts school installation with the configured secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/school/installation')
      .set('X-Initial-Setup-Secret', setupSecret)
      .field('name', 'New School')
      .field('address', '123 School Road')
      .field('email', 'school@example.invalid')
      .field('phone', '+123456789');
    expect(response.status).toBe(201);
    expect(processInstallation).toHaveBeenCalledTimes(1);
  });

  it('permits the configured secret only while enabled', async () => {
    const success = await request(app.getHttpServer())
      .post('/api/v1/superadmin')
      .set('X-Initial-Setup-Secret', setupSecret)
      .send(superadminPayload);
    expect(success.status).toBe(201);
    expect(createSuperAdmin).toHaveBeenCalledTimes(1);

    configuredSecret = undefined;
    const disabled = await request(app.getHttpServer())
      .post('/api/v1/superadmin')
      .set('X-Initial-Setup-Secret', setupSecret)
      .send(superadminPayload);
    expect(disabled.status).toBe(404);
    expect(createSuperAdmin).toHaveBeenCalledTimes(1);
  });
});
