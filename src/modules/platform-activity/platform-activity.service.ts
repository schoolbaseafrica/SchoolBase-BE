import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

type StaffLoginRow = { last_staff_login_at: Date | null };

@Injectable()
export class PlatformActivityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformActivityService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (
      !this.config.get<string>('PLATFORM_ACTIVITY_URL') &&
      !this.config.get<string>('PLATFORM_SCHOOL_TOKEN')
    )
      return;
    if (!this.validConfiguration()) {
      this.logger.warn(
        'Platform activity reporting is disabled: invalid configuration',
      );
      return;
    }
    void this.reportOnce();
    this.timer = setInterval(() => void this.reportOnce(), 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private validConfiguration(): boolean {
    const token = this.config.get<string>('PLATFORM_SCHOOL_TOKEN') || '';
    const rawUrl = this.config.get<string>('PLATFORM_ACTIVITY_URL') || '';
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return false;
    try {
      const url = new URL(rawUrl);
      return (
        url.protocol === 'https:' &&
        !!url.hostname &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        !url.port &&
        url.pathname === '/school-signals/staff-login'
      );
    } catch {
      return false;
    }
  }

  async reportOnce(): Promise<boolean> {
    if (this.running || !this.validConfiguration()) return false;
    this.running = true;
    try {
      // The existing timestamp column is stored without a timezone. SchoolBase
      // writes UTC Date values; interpret that stored value as UTC on export.
      const rows = (await this.dataSource.query(
        `SELECT MAX("last_login_at") AT TIME ZONE 'UTC' AS last_staff_login_at
         FROM "users"
         WHERE "role"::text[] && ARRAY['ADMIN', 'TEACHER']::text[]`,
      )) as StaffLoginRow[];
      const observedAt = new Date();
      const loginAt = rows[0]?.last_staff_login_at
        ? new Date(rows[0].last_staff_login_at)
        : null;
      if (
        loginAt &&
        (!Number.isFinite(loginAt.getTime()) || loginAt > observedAt)
      ) {
        this.logger.warn(
          'Platform activity report skipped: invalid staff login time',
        );
        return false;
      }
      const response = await fetch(
        this.config.get<string>('PLATFORM_ACTIVITY_URL')!,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: {
            authorization: `Bearer ${this.config.get<string>('PLATFORM_SCHOOL_TOKEN')}`,
            ['content-type']: 'application/json',
          },
          body: JSON.stringify({
            report_id: randomUUID(),
            observed_at: observedAt.toISOString(),
            last_staff_login_at: loginAt?.toISOString() ?? null,
          }),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          `Platform activity report rejected with HTTP ${response.status}`,
        );
        return false;
      }
      return true;
    } catch {
      this.logger.warn(
        'Platform activity report unavailable; will retry on next interval',
      );
      return false;
    } finally {
      this.running = false;
    }
  }
}
