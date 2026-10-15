import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EmailTemplateID } from '../../../constants/email-constants';
import { EmailService } from '../../email/email.service';
import { OwnerDigestCategory } from '../../school/dto/owner-email-digest.dto';
import { nextOwnerDigestTime } from '../../school/owner-email-digest.service';

const categories: Record<
  OwnerDigestCategory,
  { title: string; path: string; types: string[] }
> = {
  students: {
    title: 'Students and families',
    path: '/admin/students',
    types: ['STUDENT', 'PARENT'],
  },
  attendance: {
    title: 'Attendance',
    path: '/admin/attendance',
    types: ['ATTENDANCE'],
  },
  fees: {
    title: 'Fees and payments',
    path: '/admin/fees-record',
    types: ['FEE', 'PAYMENT'],
  },
  assessments: {
    title: 'Exams and results',
    path: '/admin/results',
    types: ['RESULT'],
  },
  staff: {
    title: 'Teachers and staff',
    path: '/admin/teachers',
    types: ['TEACHER', 'STAFF'],
  },
};

type DueDigest = {
  school_id: string;
  school_name: string;
  owner_user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  frequency: 'daily' | 'weekly';
  categories: OwnerDigestCategory[];
  period_start_at: Date;
  attempts: number;
};

@Injectable()
export class OwnerEmailDigestDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OwnerEmailDigestDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) =>
        this.logger.error('Owner summary delivery failed', error),
      );
    }, 60_000);
    this.timer.unref();
    void this.drain().catch((error: unknown) =>
      this.logger.error('Owner summary delivery failed', error),
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async drain() {
    if (
      !this.config.get<string>('mail.host') ||
      !this.config.get<string>('mail.from.address')
    )
      return;
    await this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT pref."school_id", school."name" AS school_name, school."owner_user_id",
                usr."email", usr."first_name", usr."last_name", pref."frequency",
                pref."categories", pref."period_start_at", pref."attempts"
         FROM "owner_email_digest_preferences" pref
         JOIN "schools" school ON school."id" = pref."school_id"
         JOIN "users" usr ON usr."id" = school."owner_user_id"
         WHERE pref."enabled" = true AND pref."next_due_at" <= now()
           AND school."installation_completed" = true
           AND usr."is_active" = true AND usr."deleted_at" IS NULL
           AND usr."email" IS NOT NULL
         ORDER BY pref."next_due_at" LIMIT 1 FOR UPDATE OF pref SKIP LOCKED`,
      )) as DueDigest[];
      const row = rows[0];
      if (!row) return;
      const end = new Date();
      const start = row.period_start_at ?? end;
      const selected = row.categories.filter(
        (category) => category in categories,
      );
      const types = [
        ...new Set(selected.flatMap((category) => categories[category].types)),
      ];
      const audit = types.length
        ? ((await manager.query(
            `SELECT "entity_type", COUNT(*)::int AS count FROM "activity_logs"
             WHERE "created_at" >= $1 AND "created_at" < $2
               AND "entity_type" = ANY($3::varchar[])
             GROUP BY "entity_type"`,
            [start, end, types],
          )) as Array<{ entity_type: string; count: number }>)
        : [];
      const byType = new Map(
        audit.map((item) => [item.entity_type, Number(item.count)]),
      );
      const examAttempts = selected.includes('assessments')
        ? ((await manager.query(
            `SELECT COUNT(*)::int AS count FROM "cbt_attempts"
             WHERE "submitted_at" >= $1 AND "submitted_at" < $2`,
            [start, end],
          )) as Array<{ count: number }>)
        : [];
      const base =
        this.config.get<string>('frontend.url')?.replace(/\/+$/, '') ?? '';
      const sections = selected.map((category) => {
        const item = categories[category];
        const count =
          item.types.reduce((sum, type) => sum + (byType.get(type) ?? 0), 0) +
          (category === 'assessments'
            ? Number(examAttempts[0]?.count ?? 0)
            : 0);
        return { title: item.title, count, url: `${base}${item.path}` };
      });
      const dateRange = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
      const subject = `${row.school_name}: ${row.frequency} activity summary`;
      const text = [
        subject,
        dateRange,
        ...sections.map(
          (item) =>
            `${item.title}: ${item.count} recorded updates — ${item.url}`,
        ),
        'Counts cover recorded activity. Sign in for details.',
      ].join('\n');
      try {
        await this.emailService.sendMail({
          to: [
            {
              email: row.email,
              name: `${row.first_name} ${row.last_name}`.trim(),
            },
          ],
          subject,
          templateNameID: EmailTemplateID.OWNER_ACTIVITY_DIGEST,
          templateData: { subject, dateRange, sections },
          text,
        });
      } catch {
        await manager.query(
          `UPDATE "owner_email_digest_preferences"
           SET "attempts" = "attempts" + 1,
               "next_due_at" = now() + (LEAST(POWER(2, LEAST("attempts", 6)), 60) * interval '1 minute'),
               "updated_at" = now() WHERE "school_id" = $1`,
          [row.school_id],
        );
        this.logger.warn(
          `Owner summary delivery will retry for school ${row.school_id}`,
        );
        return;
      }
      await manager.query(
        `UPDATE "owner_email_digest_preferences"
         SET "last_sent_at" = $2, "period_start_at" = $2, "next_due_at" = $3,
             "attempts" = 0, "updated_at" = now()
         WHERE "school_id" = $1`,
        [row.school_id, end, nextOwnerDigestTime(end, row.frequency)],
      );
    });
  }
}
