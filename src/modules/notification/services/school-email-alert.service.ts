import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { EmailTemplateID } from '../../../constants/email-constants';
import { EmailService } from '../../email/email.service';

export type SchoolEmailAlertType = 'results' | 'fees' | 'attendance';
export type SchoolEmailAlert = {
  recipient_user_id: string;
  subject: string;
  message: string;
  dedupe_key?: string;
  metadata?: {
    student_id: string;
    class_id: string;
    date: string;
    status: string;
  };
};

@Injectable()
export class SchoolEmailAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolEmailAlertService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) =>
        this.logger.error('Email alert outbox processing failed', error),
      );
    }, 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(
    type: SchoolEmailAlertType,
    alerts: SchoolEmailAlert[],
  ): Promise<void> {
    if (!alerts.length) return;
    try {
      const settings = (await this.dataSource.query(
        `SELECT "email_alert_results", "email_alert_fees", "email_alert_attendance"
         FROM "schools" WHERE "installation_completed" = true LIMIT 1`,
      )) as Record<string, boolean>[];
      if (!settings[0]?.[`email_alert_${type}`]) return;
      await this.dataSource.query(
        `INSERT INTO "school_email_alert_outbox"
           ("alert_type", "recipient_user_id", "subject", "message", "dedupe_key", "metadata")
         SELECT $1, item.recipient_user_id, item.subject, item.message, item.dedupe_key, item.metadata
         FROM jsonb_to_recordset($2::jsonb) AS item(
           recipient_user_id uuid, subject text, message text, dedupe_key text, metadata jsonb)
         ON CONFLICT ("dedupe_key") DO NOTHING`,
        [type, JSON.stringify(alerts)],
      );
    } catch (error) {
      this.logger.error(`Unable to queue ${type} email alerts`, error);
    }
  }

  async enqueueAttendance(
    records: Array<{
      student_id: string;
      class_id: string;
      date: string;
      status: 'ABSENT' | 'LATE';
    }>,
  ): Promise<void> {
    if (!records.length) return;
    try {
      const students = (await this.dataSource.query(
        `SELECT student."id" AS "student_id", parent."user_id" AS "parent_user_id",
                usr."first_name", usr."last_name"
         FROM "students" student
         JOIN "parents" parent ON parent."id" = student."parent_id"
         JOIN "users" usr ON usr."id" = student."user_id"
         WHERE student."id" = ANY($1::uuid[]) AND student."is_deleted" = false`,
        [records.map((record) => record.student_id)],
      )) as Array<{
        student_id: string;
        parent_user_id: string;
        first_name: string;
        last_name: string;
      }>;
      const byStudent = new Map(
        students.map((student) => [student.student_id, student]),
      );
      await this.enqueue(
        'attendance',
        records.flatMap((record) => {
          const student = byStudent.get(record.student_id);
          if (!student?.parent_user_id) return [];
          const name = `${student.first_name} ${student.last_name}`;
          return [
            {
              recipient_user_id: student.parent_user_id,
              subject: `${name}'s attendance update`,
              message: `${name} was marked ${record.status.toLowerCase()} on ${record.date}. Sign in to SchoolBase for details.`,
              dedupe_key: `attendance:${record.student_id}:${record.date}:${record.status}`,
              metadata: record,
            },
          ];
        }),
      );
    } catch (error) {
      this.logger.error('Unable to queue attendance email alerts', error);
    }
  }

  async drain(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT "id", "alert_type", "recipient_user_id", "subject", "message", "attempts", "metadata"
         FROM "school_email_alert_outbox"
         WHERE "sent_at" IS NULL AND "discarded_at" IS NULL
           AND "next_attempt_at" <= now() AND "attempts" < 10
         ORDER BY "created_at" LIMIT 20 FOR UPDATE SKIP LOCKED`,
      )) as Array<{
        id: string;
        alert_type: SchoolEmailAlertType;
        recipient_user_id: string;
        subject: string;
        message: string;
        attempts: number;
        metadata: SchoolEmailAlert['metadata'] | null;
      }>;
      if (!rows.length) return;
      const settings = (await manager.query(
        `SELECT "email_alert_results", "email_alert_fees", "email_alert_attendance"
         FROM "schools" WHERE "installation_completed" = true LIMIT 1 FOR SHARE`,
      )) as Record<string, boolean>[];

      for (const row of rows) {
        if (!settings[0]?.[`email_alert_${row.alert_type}`]) {
          await manager.query(
            `UPDATE "school_email_alert_outbox" SET "discarded_at" = now(), "last_error" = 'Alert switched off' WHERE "id" = $1`,
            [row.id],
          );
          continue;
        }
        if (row.alert_type === 'attendance' && row.metadata) {
          const current = (await manager.query(
            `SELECT "status" FROM "student_daily_attendance"
             WHERE "student_id" = $1 AND "class_id" = $2 AND "date"::date = $3::date
             LIMIT 1`,
            [row.metadata.student_id, row.metadata.class_id, row.metadata.date],
          )) as Array<{ status: string }>;
          if (current[0]?.status !== row.metadata.status) {
            await manager.query(
              `UPDATE "school_email_alert_outbox" SET "discarded_at" = now(), "last_error" = 'Attendance status changed' WHERE "id" = $1`,
              [row.id],
            );
            continue;
          }
        }
        const recipients = (await manager.query(
          `SELECT "email", "first_name", "last_name" FROM "users"
           WHERE "id" = $1 AND "is_active" = true AND "deleted_at" IS NULL`,
          [row.recipient_user_id],
        )) as Array<{ email: string; first_name: string; last_name: string }>;
        const recipient = recipients[0];
        if (!recipient?.email) {
          await manager.query(
            `UPDATE "school_email_alert_outbox" SET "discarded_at" = now(), "last_error" = 'Recipient unavailable' WHERE "id" = $1`,
            [row.id],
          );
          continue;
        }
        try {
          await this.emailService.sendMail({
            to: [
              {
                email: recipient.email,
                name: `${recipient.first_name} ${recipient.last_name}`,
              },
            ],
            subject: row.subject,
            templateNameID: EmailTemplateID.SCHOOL_ACTIVITY_ALERT,
            templateData: { subject: row.subject, message: row.message },
            text: row.message,
          });
          await manager.query(
            `UPDATE "school_email_alert_outbox" SET "sent_at" = now(), "last_error" = NULL WHERE "id" = $1`,
            [row.id],
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Email delivery failed';
          await manager.query(
            `UPDATE "school_email_alert_outbox"
             SET "attempts" = "attempts" + 1,
                 "next_attempt_at" = now() + (LEAST(POWER(2, "attempts"), 60) * interval '1 minute'),
                 "discarded_at" = CASE WHEN "attempts" + 1 >= 10 THEN now() ELSE NULL END,
                 "last_error" = $2
             WHERE "id" = $1`,
            [row.id, message.slice(0, 1000)],
          );
          this.logger.warn(`Email alert ${row.id} will retry`);
        }
      }
    });
  }
}
