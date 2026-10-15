import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import { writeActivityLog } from '../activity-log/write-activity-log';
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
  constructor(
    @InjectRepository(School)
    private readonly schools: Repository<School>,
    private readonly minio: MinioService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private async currentSchool(): Promise<School> {
    const school = await this.schools.findOne({
      where: { installation_completed: true },
    });
    if (!school) throw new ConflictException('School not found');
    return school;
  }

  async updateSchool(
    dto: UpdateSchoolSettingsDto,
    logo?: IMulterFile,
    actorUserId?: string,
  ) {
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
    if (dto.activity_log_retention_days !== undefined) {
      const requested =
        dto.activity_log_retention_days === ''
          ? null
          : Number(dto.activity_log_retention_days);
      if (requested !== (school.activity_log_retention_days ?? null)) {
        throw new BadRequestException(
          'Use the school owner retention control to change activity log retention',
        );
      }
    }
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
      const values = dto as Record<string, string | null | undefined>;
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        if (
          value === null &&
          key !== 'secondary_color' &&
          key !== 'accent_color'
        )
          continue;
        if (key === 'activity_log_retention_days') continue;
        if (key.startsWith('allow_manual_') || key.startsWith('email_alert_')) {
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
      // Retention has its own owner-only transaction. Ordinary settings saves
      // must never write a stale retention value back over an owner decision.
      school.activity_log_retention_days = undefined;
      if (actorUserId) {
        saved = await this.dataSource.transaction(async (manager) => {
          const updated = await manager.save(School, school);
          await writeActivityLog(manager, {
            actorUserId,
            entityType: 'SCHOOL',
            entityId: school.id,
            action: 'UPDATE',
            description: 'School settings updated',
            metadata: {
              changed_fields: [
                ...Object.keys(dto).filter(
                  (key) => key !== 'activity_log_retention_days',
                ),
                ...(logo ? ['logo'] : []),
              ],
            },
          });
          return updated;
        });
      } else {
        saved = await this.schools.save(school);
      }
    } catch (error) {
      if (uploadedKey)
        await this.minio.deleteImage(uploadedKey).catch(() => undefined);
      throw error;
    }
    return saved;
  }

  async updateActivityLogRetention(days: number | null, actorUserId: string) {
    if (days !== null && (!Number.isSafeInteger(days) || days < 1)) {
      throw new BadRequestException(
        'Retention must be a positive number of days',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT "id", "owner_user_id", "activity_log_retention_days" AS days
         FROM "schools" WHERE "installation_completed" = true LIMIT 1 FOR UPDATE`,
      )) as { id: string; owner_user_id: string | null; days: number | null }[];
      const school = rows[0];
      if (!school) throw new ConflictException('School not found');
      if (!school.owner_user_id || school.owner_user_id !== actorUserId) {
        throw new ForbiddenException(
          'Only the school owner can change activity log retention',
        );
      }
      if (school.days === days) return { activity_log_retention_days: days };
      await manager.query(
        `UPDATE "schools" SET "activity_log_retention_days" = $1, "updated_at" = now() WHERE "id" = $2`,
        [days, school.id],
      );
      await manager.query(
        `INSERT INTO "activity_logs" ("user_id", "entity_type", "entity_id", "action", "description", "old_values", "new_values")
         VALUES ($1, 'school', $2, 'UPDATE_RETENTION', 'Activity log retention changed', $3::jsonb, $4::jsonb)`,
        [
          actorUserId,
          school.id,
          JSON.stringify({ activity_log_retention_days: school.days }),
          JSON.stringify({ activity_log_retention_days: days }),
        ],
      );
      return { activity_log_retention_days: days };
    });
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
