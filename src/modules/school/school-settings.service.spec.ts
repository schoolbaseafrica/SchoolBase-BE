import { BadRequestException } from '@nestjs/common';

import { SchoolSettingsService } from './school-settings.service';

describe('SchoolSettingsService', () => {
  const school = {
    id: 'school-1',
    installation_completed: true,
    name: 'SchoolBase Demo',
    landing_page_config: null as Record<string, unknown> | null,
    activity_log_retention_days: 30 as number | null,
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
  const activityLogs = { purgeExpired: jest.fn().mockResolvedValue(0) };
  const config = {
    get: jest.fn((key: string): string =>
      key === 'mail.host' ? 'smtp.example.com' : 'school@example.com',
    ),
  };
  const service = new SchoolSettingsService(
    schools as never,
    minio as never,
    activityLogs as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('persists school information, logo, retention and manual-ID settings', async () => {
    await service.updateSchool(
      {
        name: 'New name',
        activity_log_retention_days: '',
        allow_manual_student_ids: 'false',
      },
      { buffer: Buffer.from('image'), originalname: 'logo.png' } as never,
    );

    expect(schools.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New name',
        logo_url: 'https://files.example/logo.png',
        activity_log_retention_days: null,
        allow_manual_student_ids: false,
      }),
    );
    expect(minio.uploadImage).toHaveBeenCalledTimes(1);
    expect(activityLogs.purgeExpired).toHaveBeenCalledTimes(1);
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
