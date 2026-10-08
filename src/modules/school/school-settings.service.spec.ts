import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { SchoolSettingsService } from './school-settings.service';

describe('SchoolSettingsService', () => {
  const school = {
    id: 'school-1',
    installation_completed: true,
    name: 'SchoolBase Demo',
    landing_page_config: null as Record<string, unknown> | null,
    activity_log_retention_days: null as number | null | undefined,
    owner_user_id: 'owner-1',
    allow_manual_student_ids: true,
  };
  const schools = {
    findOne: jest.fn().mockResolvedValue(school),
    save: jest.fn(async (value: unknown) => value),
  };
  const minio = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://files.example/logo.png',
      publicId: 'schoolbase-school-logos/logo.png',
    }),
    deleteImage: jest.fn(),
  };
  const manager = { query: jest.fn() };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (tx: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const config = {
    get: jest.fn((key: string): string =>
      key === 'mail.host' ? 'smtp.example.com' : 'school@example.com',
    ),
  };
  const service = new SchoolSettingsService(
    schools as never,
    minio as never,
    dataSource as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    school.activity_log_retention_days = null;
  });

  it('persists ordinary school settings without touching retention', async () => {
    await service.updateSchool(
      {
        name: 'New name',
        allow_manual_student_ids: 'false',
      },
      { buffer: Buffer.from('image'), originalname: 'logo.png' } as never,
    );

    expect(schools.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New name',
        logo_url: 'https://files.example/logo.png',
        activity_log_retention_days: undefined,
        allow_manual_student_ids: false,
      }),
    );
    expect(minio.uploadImage).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('lets the owner set and clear retention with an audit entry in the same transaction', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          id: school.id,
          owner_user_id: 'owner-1',
          days: null,
        },
      ])
      .mockResolvedValue([]);
    await expect(
      service.updateActivityLogRetention(90, 'owner-1'),
    ).resolves.toEqual({ activity_log_retention_days: 90 });
    expect(manager.query.mock.calls[1]).toEqual([
      expect.stringContaining('UPDATE "schools"'),
      [90, school.id],
    ]);
    expect(manager.query.mock.calls[2][0]).toContain(
      'INSERT INTO "activity_logs"',
    );
    expect(manager.query.mock.calls[2][1]).toContain(
      JSON.stringify({ activity_log_retention_days: 90 }),
    );

    manager.query
      .mockReset()
      .mockResolvedValueOnce([
        { id: school.id, owner_user_id: 'owner-1', days: 90 },
      ])
      .mockResolvedValue([]);
    await expect(
      service.updateActivityLogRetention(null, 'owner-1'),
    ).resolves.toEqual({ activity_log_retention_days: null });
    expect(manager.query.mock.calls[1][1]).toEqual([null, school.id]);
  });

  it('refuses non-owner changes without updating or deleting logs', async () => {
    manager.query.mockResolvedValueOnce([
      {
        id: school.id,
        owner_user_id: 'owner-1',
        days: null,
      },
    ]);
    await expect(
      service.updateActivityLogRetention(90, 'admin-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('accepts an unchanged legacy retention field but refuses changes through ordinary settings', async () => {
    await service.updateSchool({
      activity_log_retention_days: '',
      name: 'Updated',
    });
    expect(schools.save).toHaveBeenCalledWith(
      expect.objectContaining({ activity_log_retention_days: undefined }),
    );
    jest.clearAllMocks();
    await expect(
      service.updateSchool({ activity_log_retention_days: '90' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(schools.save).not.toHaveBeenCalled();
  });

  it('rejects zero days before any database work', async () => {
    await expect(
      service.updateActivityLogRetention(0, 'owner-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('allows a saved ID format to be cleared back to automatic defaults', async () => {
    await service.updateSchool({
      student_id_format: '',
      teacher_id_format: '',
      student_id_prefix: 'STU',
      teacher_id_prefix: 'EMP',
    });

    expect(schools.save).toHaveBeenCalledWith(
      expect.objectContaining({ student_id_format: '', teacher_id_format: '' }),
    );
  });

  it('persists school-wide email switches without changing account email behavior', async () => {
    await service.updateSchool({
      email_alert_results: 'true',
      email_alert_fees: 'false',
      email_alert_attendance: 'true',
    });
    expect(schools.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email_alert_results: true,
        email_alert_fees: false,
        email_alert_attendance: true,
      }),
    );
  });

  it('refuses to enable optional emails without SMTP configuration', async () => {
    config.get.mockReturnValueOnce('');
    await expect(
      service.updateSchool({ email_alert_results: 'true' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(schools.save).not.toHaveBeenCalled();
  });

  it('reads and saves one-page content through the school record', async () => {
    const config = {
      hero_images: [
        { id: 'hero-1', url: 'https://files.example/hero.png', order: 0 },
      ],
      gallery_images: [],
      testimonials: [],
    };
    await expect(service.getLandingPageConfig()).resolves.toEqual({
      landing_page_config: {
        hero_images: [],
        gallery_images: [],
        testimonials: [],
      },
    });
    await expect(service.updateLandingPageConfig(config)).resolves.toEqual({
      landing_page_config: config,
    });
    expect(schools.save).toHaveBeenCalledWith(
      expect.objectContaining({ landing_page_config: config }),
    );
  });
});
