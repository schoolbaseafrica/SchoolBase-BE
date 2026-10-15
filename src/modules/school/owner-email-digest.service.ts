import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import {
  OwnerEmailDigestDto,
  OwnerDigestCategory,
  OwnerDigestFrequency,
  ownerDigestCategories,
} from './dto/owner-email-digest.dto';

export function nextOwnerDigestTime(
  now: Date,
  frequency: OwnerDigestFrequency,
) {
  const due = new Date(now);
  due.setUTCHours(7, 0, 0, 0); // 08:00 Africa/Lagos
  due.setUTCDate(due.getUTCDate() + 1);
  if (frequency === 'weekly') {
    while (due.getUTCDay() !== 1) due.setUTCDate(due.getUTCDate() + 1);
  }
  return due;
}

type DigestRow = {
  enabled: boolean;
  frequency: OwnerDigestFrequency;
  categories: OwnerDigestCategory[];
  next_due_at: Date | null;
  last_sent_at: Date | null;
};

@Injectable()
export class OwnerEmailDigestService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private async ownerSchool(actorUserId: string) {
    const rows = (await this.dataSource.query(
      `SELECT school."id" FROM "schools" school
       JOIN "users" usr ON usr."id" = school."owner_user_id"
       WHERE school."installation_completed" = true
         AND school."owner_user_id" = $1
         AND usr."is_active" = true AND usr."deleted_at" IS NULL LIMIT 1`,
      [actorUserId],
    )) as Array<{ id: string }>;
    if (!rows[0]) throw new ForbiddenException('School owner access required');
    return rows[0].id;
  }

  async get(actorUserId: string) {
    const schoolId = await this.ownerSchool(actorUserId);
    const rows = (await this.dataSource.query(
      `SELECT "enabled", "frequency", "categories", "next_due_at", "last_sent_at"
       FROM "owner_email_digest_preferences" WHERE "school_id" = $1`,
      [schoolId],
    )) as DigestRow[];
    return (
      rows[0] ?? {
        enabled: false,
        frequency: 'daily',
        categories: [...ownerDigestCategories],
        next_due_at: null,
        last_sent_at: null,
      }
    );
  }

  async update(actorUserId: string, dto: OwnerEmailDigestDto) {
    const schoolId = await this.ownerSchool(actorUserId);
    if (
      dto.enabled &&
      (!this.config.get<string>('mail.host') ||
        !this.config.get<string>('mail.from.address'))
    ) {
      throw new BadRequestException(
        'Configure SMTP host and sender address before enabling summaries',
      );
    }
    if (dto.enabled) {
      const owner = (await this.dataSource.query(
        `SELECT "email" FROM "users" WHERE "id" = $1 AND "is_active" = true AND "deleted_at" IS NULL`,
        [actorUserId],
      )) as Array<{ email: string | null }>;
      if (!owner[0]?.email)
        throw new BadRequestException(
          'Add an email address to your owner account',
        );
    }
    await this.dataSource.transaction(async (manager) => {
      const ownership = (await manager.query(
        `SELECT "owner_user_id" FROM "schools" WHERE "id" = $1 FOR UPDATE`,
        [schoolId],
      )) as Array<{ owner_user_id: string | null }>;
      if (ownership[0]?.owner_user_id !== actorUserId)
        throw new ForbiddenException('School owner access required');
      const current = (await manager.query(
        `SELECT "enabled", "frequency", "categories" FROM "owner_email_digest_preferences"
         WHERE "school_id" = $1 FOR UPDATE`,
        [schoolId],
      )) as DigestRow[];
      const changed =
        !current[0]?.enabled ||
        current[0]?.frequency !== dto.frequency ||
        JSON.stringify(current[0]?.categories) !==
          JSON.stringify(dto.categories);
      const now = new Date();
      const due = dto.enabled
        ? changed
          ? nextOwnerDigestTime(now, dto.frequency)
          : undefined
        : null;
      await manager.query(
        `INSERT INTO "owner_email_digest_preferences"
           ("school_id", "enabled", "frequency", "categories", "period_start_at", "next_due_at")
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT ("school_id") DO UPDATE SET
           "enabled" = EXCLUDED."enabled", "frequency" = EXCLUDED."frequency",
           "categories" = EXCLUDED."categories",
           "period_start_at" = CASE WHEN $7 THEN EXCLUDED."period_start_at" ELSE "owner_email_digest_preferences"."period_start_at" END,
           "next_due_at" = CASE WHEN $7 OR NOT EXCLUDED."enabled" THEN EXCLUDED."next_due_at" ELSE "owner_email_digest_preferences"."next_due_at" END,
           "attempts" = CASE WHEN $7 OR NOT EXCLUDED."enabled" THEN 0 ELSE "owner_email_digest_preferences"."attempts" END,
           "updated_at" = now()`,
        [
          schoolId,
          dto.enabled,
          dto.frequency,
          JSON.stringify(dto.categories),
          now,
          due,
          changed,
        ],
      );
      await manager.query(
        `INSERT INTO "activity_logs" ("user_id", "entity_type", "entity_id", "action", "description", "new_values")
         VALUES ($1, 'SCHOOL', $2, 'UPDATE', 'Owner email summary preferences updated', $3::jsonb)`,
        [actorUserId, schoolId, JSON.stringify(dto)],
      );
    });
    return this.get(actorUserId);
  }
}
