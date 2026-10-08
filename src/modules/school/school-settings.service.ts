import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MinioService } from '../upload/services/minio.service';

import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { School } from './entities/school.entity';
import { schoolIdPattern } from './utils/school-id-format';

const emptyLandingPage = {
  hero_images: [],
  gallery_images: [],
  testimonials: [],
};

@Injectable()
export class SchoolSettingsService {
  private readonly logger = new Logger(SchoolSettingsService.name);
  constructor(
    @InjectRepository(School)
    private readonly schools: Repository<School>,
    private readonly minio: MinioService,
    private readonly activityLogs: ActivityLogService,
    private readonly config: ConfigService,
  ) {}

  private async currentSchool(): Promise<School> {
    const school = await this.schools.findOne({
      where: { installation_completed: true },
    });
    if (!school) throw new ConflictException('School not found');
    return school;
  }

  async updateSchool(dto: UpdateSchoolSettingsDto, logo?: IMulterFile) {
    if (
      [
        dto.email_alert_results,
        dto.email_alert_fees,
        dto.email_alert_attendance,
      ].includes('true') &&
      (!this.config.get<string>('mail.host') ||
        !this.config.get<string>('mail.from.address'))
    ) {
      throw new BadRequestException(
        'Configure SMTP host and sender address before enabling email alerts',
      );
    }
    const school = await this.currentSchool();
    let uploadedKey: string | undefined;
    let saved: School;
    try {
      if (logo) {
        const uploaded = await this.minio.uploadImage(
          logo,
          'schoolbase-school-logos',
        );
        school.logo_url = uploaded.url;
        uploadedKey = uploaded.publicId;
      }
      const values = dto as Record<string, string | undefined>;
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        if (key === 'activity_log_retention_days') {
          school.activity_log_retention_days =
            value === '' ? null : Number(value);
        } else if (
          key.startsWith('allow_manual_') ||
          key.startsWith('email_alert_')
        ) {
          (school as unknown as Record<string, unknown>)[key] =
            value === 'true';
        } else {
          (school as unknown as Record<string, unknown>)[key] = value;
        }
      }
      schoolIdPattern(
        school.student_id_format,
        school.student_id_prefix ?? 'STU',
        school.school_code ?? '',
        4,
      );
      schoolIdPattern(
        school.teacher_id_format,
        school.teacher_id_prefix ?? 'EMP',
        school.school_code ?? '',
        3,
      );
      saved = await this.schools.save(school);
    } catch (error) {
      if (uploadedKey)
        await this.minio.deleteImage(uploadedKey).catch(() => undefined);
      throw error;
    }
    if (dto.activity_log_retention_days !== undefined) {
      await this.activityLogs
        .purgeExpired()
        .catch((error) =>
          this.logger.warn(
            'Activity log cleanup will retry on the next scheduled run',
            error,
          ),
        );
    }
    return saved;
  }

  async getLandingPageConfig() {
    const school = await this.currentSchool();
    return {
      landing_page_config: school.landing_page_config ?? emptyLandingPage,
    };
  }

  async updateLandingPageConfig(config: Record<string, unknown>) {
    const school = await this.currentSchool();
    school.landing_page_config = config;
    const saved = await this.schools.save(school);
    return {
      landing_page_config: saved.landing_page_config ?? emptyLandingPage,
    };
  }
}
