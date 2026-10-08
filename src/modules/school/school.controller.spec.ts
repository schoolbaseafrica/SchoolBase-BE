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

import { SchoolSettingsService } from './school-settings.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

describe('SchoolController', () => {
  let controller: SchoolController;

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
          provide: SchoolService,
          useValue: mockSchoolService,
        },
        {
          provide: SchoolSettingsService,
          useValue: {
            updateSchool: jest.fn(),
            getLandingPageConfig: jest.fn(),
            updateLandingPageConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SchoolController>(SchoolController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
