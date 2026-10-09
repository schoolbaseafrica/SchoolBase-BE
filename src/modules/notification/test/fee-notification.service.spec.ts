import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { FeesModelAction } from '../../fees/model-action/fees.model-action';
import { FeeNotificationType } from '../../shared/enums';
import { NotificationModelAction } from '../model-actions/notification.model-action';
import { FeeNotificationService } from '../services/fee-notification.service';
import { SchoolEmailAlertService } from '../services/school-email-alert.service';

describe('FeeNotificationService', () => {
  let service: FeeNotificationService;
  const enqueue = jest.fn();
  const createMany = jest.fn();
  const getFee = jest.fn();
  // let notificationModelAction: jest.Mocked<NotificationModelAction>;
  // let feesModelAction: jest.Mocked<FeesModelAction>;

  const mockLogger = {
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeNotificationService,
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
        {
          provide: NotificationModelAction,
          useValue: {
            createMany,
          },
        },
        {
          provide: FeesModelAction,
          useValue: {
            get: getFee,
          },
        },
        { provide: SchoolEmailAlertService, useValue: { enqueue } },
      ],
    }).compile();

    service = module.get<FeeNotificationService>(FeeNotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('queues fee email for a linked parent after creating the in-app notice', async () => {
    getFee.mockResolvedValue({
      id: 'fee-id',
      component_name: 'Tuition',
      amount: 100,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      classes: [],
      direct_assignments: [
        {
          student: {
            id: 'student-id',
            parent: { user_id: 'parent-id' },
            user: { first_name: 'Ada', last_name: 'Okoro' },
          },
        },
      ],
    });
    await service.createAndUpdateFeesNotification(
      'fee-id',
      FeeNotificationType.CREATED,
    );
    expect(createMany).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith('fees', [
      expect.objectContaining({
        recipient_user_id: 'parent-id',
        dedupe_key: 'fee:fee-id:created:2026-10-01T00:00:00.000Z:student-id',
      }),
    ]);
  });
});
