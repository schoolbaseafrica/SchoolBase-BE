import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ListActivityLogsQueryDto } from './dto/list-activity-logs-query.dto';

@Injectable()
export class ActivityLogService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: ListActivityLogsQueryDto) {
    const { page = 1, limit = 20 } = query;
    const parameters: unknown[] = [];
    const conditions: string[] = [];
    const addCondition = (sql: string, value: unknown) => {
      parameters.push(value);
      conditions.push(sql.replace('?', `$${parameters.length}`));
    };

    if (query.user_id) addCondition('log."user_id" = ?', query.user_id);
    if (query.entity_type)
      addCondition('log."entity_type" = ?', query.entity_type);
    if (query.entity_id) addCondition('log."entity_id" = ?', query.entity_id);
    if (query.action) addCondition('log."action" = ?', query.action);
    if (query.start_date)
      addCondition('log."created_at" >= ?::timestamptz', query.start_date);
    if (query.end_date)
      addCondition(
        `log."created_at" < (?::date + INTERVAL '1 day')`,
        query.end_date,
      );

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS "total" FROM "activity_logs" log ${where}`,
      [...parameters],
    )) as { total: number }[];
    const total = Number(countRows[0]?.total ?? 0);

    parameters.push(limit, (page - 1) * limit);
    const data = (await this.dataSource.query(
      `SELECT
        log."id", log."user_id", log."entity_type", log."entity_id",
        log."action", log."description", log."old_values", log."new_values",
        log."metadata", log."created_at",
        CONCAT_WS(' ', usr."first_name", usr."last_name") AS "user_name",
        usr."email" AS "user_email"
       FROM "activity_logs" log
       LEFT JOIN "users" usr ON usr."id" = log."user_id"
       ${where}
       ORDER BY log."created_at" DESC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )) as Record<string, unknown>[];

    return {
      data,
      message: 'Activity logs retrieved successfully',
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        has_next: page * limit < total,
        has_previous: page > 1,
      },
    };
  }
}
