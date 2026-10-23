// Mock external modules that have native dependencies BEFORE any imports
/* eslint-disable @typescript-eslint/naming-convention */
jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(),
}));
/* eslint-enable @typescript-eslint/naming-convention */
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  unlink: jest.fn(),
}));
jest.mock('./decorators/installation-api.decorator', () => ({
  installationApi:
    () =>
    (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { InitialSetupGuard } from '../../common/guards/initial-setup.guard';

import { OwnerEmailDigestService } from './owner-email-digest.service';
import { SchoolSettingsService } from './school-settings.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

describe('SchoolController', () => {
  let controller: SchoolController;
  let settings: {
    updateActivityLogRetention: jest.Mock;
    updateSchool: jest.Mock;
  };
  let schoolService: { getSchoolDetails: jest.Mock };
  let ownerDigest: { get: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    const mockSchoolService = {
      processInstallation: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolController],
      providers: [
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: InitialSetupGuard, useValue: { canActivate: () => true } },
        {
          provide: OwnerEmailDigestService,
          useValue: { get: jest.fn(), update: jest.fn() },
        },
        {
          provide: SchoolService,
          useValue: mockSchoolService,
        },
        {
          provide: SchoolSettingsService,
          useValue: {
            updateSchool: jest.fn(),
            updateActivityLogRetention: jest.fn(),
            getLandingPageConfig: jest.fn(),
            updateLandingPageConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SchoolController>(SchoolController);
    settings = module.get(SchoolSettingsService);
    schoolService = module.get(SchoolService);
    ownerDigest = module.get(OwnerEmailDigestService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the authenticated actor to retention updates', () => {
    controller.updateActivityLogRetention({ activity_log_retention_days: 90 }, {
      id: 'owner-1',
    } as never);
    expect(settings.updateActivityLogRetention).toHaveBeenCalledWith(
      90,
      'owner-1',
    );
  });

  it('passes the authenticated actor to ordinary settings updates', async () => {
    schoolService.getSchoolDetails = jest
      .fn()
      .mockResolvedValue({ id: 'school-1' });
    await controller.updateSchool({ name: 'New name' }, {
      id: 'admin-1',
    } as never);
    expect(settings.updateSchool).toHaveBeenCalledWith(
      { name: 'New name' },
      undefined,
      'admin-1',
    );
  });

  it('uses the signed-in owner identity for summary preferences', () => {
    const actor = { id: 'owner-1' } as never;
    const dto = {
      enabled: true,
      frequency: 'daily',
      categories: ['fees'],
    } as never;
    controller.getOwnerEmailDigest(actor);
    controller.updateOwnerEmailDigest(dto, actor);
    expect(ownerDigest.get).toHaveBeenCalledWith('owner-1');
    expect(ownerDigest.update).toHaveBeenCalledWith('owner-1', dto);
  });
});
