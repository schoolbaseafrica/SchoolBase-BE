import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import { VirtualClassroomService } from './virtual-classroom.service';

export interface ICollaborationTicket {
  sub: string;
  classroomId: string;
  roles: string[];
  canWrite: boolean;
  allowStudentDraw: boolean;
  name: string;
  type: 'classroom-collaboration';
}

@Injectable()
export class ClassroomCollaborationService {
  constructor(
    private readonly classrooms: VirtualClassroomService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async createTicket(classroomId: string, userId: string, roles: string[]) {
    const room = await this.classrooms.get(classroomId, userId, roles);
    if (room.status !== 'live')
      throw new BadRequestException(
        'Collaboration is available only while the classroom is live',
      );
    const canWrite =
      roles.includes('admin') ||
      roles.includes('teacher') ||
      (roles.includes('student') && room.allowStudentDraw);
    const users = (await this.dataSource.query(
      `SELECT concat_ws(' ', first_name, last_name) AS name FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )) as Array<{ name: string }>;
    const name = users[0]?.name?.trim() || 'Classroom participant';
    return {
      ticket: await this.jwt.signAsync(
        {
          sub: userId,
          classroomId,
          roles,
          canWrite,
          allowStudentDraw: room.allowStudentDraw,
          name,
          type: 'classroom-collaboration',
        },
        { expiresIn: '2m', audience: 'classroom-collaboration' },
      ),
      expiresInSeconds: 120,
      namespace: '/classroom-collaboration',
      classroomId,
      canWrite,
      allowStudentDraw: room.allowStudentDraw,
    };
  }

  async verifyTicket(ticket: string) {
    const payload = await this.jwt.verifyAsync<ICollaborationTicket>(ticket, {
      audience: 'classroom-collaboration',
    });
    if (payload.type !== 'classroom-collaboration')
      throw new ForbiddenException('Invalid collaboration ticket');
    await this.classrooms.get(payload.classroomId, payload.sub, payload.roles);
    return payload;
  }

  async canWrite(classroomId: string, userId: string, roles: string[]) {
    const room = await this.classrooms.get(classroomId, userId, roles);
    return (
      room.status === 'live' &&
      (roles.includes('admin') ||
        roles.includes('teacher') ||
        (roles.includes('student') && room.allowStudentDraw))
    );
  }

  async sync(classroomId: string, pageKey: string, sinceSequence = 0) {
    this.assertPageKey(pageKey);
    await this.ensurePage(classroomId, pageKey);
    const snapshots = (await this.dataSource.query(
      `SELECT sequence, state_data AS data FROM virtual_classroom_whiteboard_snapshots
       WHERE classroom_id = $1 AND page_key = $2
       ORDER BY sequence DESC LIMIT 1`,
      [classroomId, pageKey],
    )) as Array<{ sequence: string; data: Buffer }>;
    const snapshot = snapshots[0];
    const baseline = Math.max(sinceSequence, Number(snapshot?.sequence ?? 0));
    const updates = (await this.dataSource.query(
      `SELECT sequence, update_data AS data FROM virtual_classroom_whiteboard_updates
       WHERE classroom_id = $1 AND page_key = $2 AND sequence > $3
       ORDER BY sequence ASC LIMIT 1000`,
      [classroomId, pageKey, baseline],
    )) as Array<{ sequence: string; data: Buffer }>;
    return {
      pageKey,
      snapshot:
        snapshot && Number(snapshot.sequence) > sinceSequence
          ? {
              sequence: Number(snapshot.sequence),
              update: snapshot.data.toString('base64'),
            }
          : null,
      updates: updates.map((item) => ({
        sequence: Number(item.sequence),
        update: item.data.toString('base64'),
      })),
      sequence: updates.length
        ? Number(updates[updates.length - 1].sequence)
        : baseline,
    };
  }

  async appendUpdate(
    classroomId: string,
    pageKey: string,
    update: string,
    userId: string,
  ) {
    this.assertPageKey(pageKey);
    const data = Buffer.from(update, 'base64');
    if (!data.length || data.length > 512_000)
      throw new BadRequestException(
        'Whiteboard update must be between 1 byte and 500 KB',
      );
    const test = new Doc();
    try {
      applyUpdate(test, data);
    } catch {
      throw new BadRequestException('Invalid Yjs update');
    }
    const sequence = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `${classroomId}:${pageKey}`,
      ]);
      const rooms = (await manager.query(
        `SELECT status FROM virtual_classroom_sessions WHERE id = $1 LIMIT 1`,
        [classroomId],
      )) as Array<{ status: string }>;
      if (rooms[0]?.status !== 'live')
        throw new BadRequestException(
          'Collaboration is available only while the classroom is live',
        );
      await this.ensurePage(classroomId, pageKey, manager);
      const rows = (await manager.query(
        `SELECT COALESCE(MAX(sequence), 0)::bigint + 1 AS sequence FROM virtual_classroom_whiteboard_updates WHERE classroom_id = $1 AND page_key = $2`,
        [classroomId, pageKey],
      )) as Array<{ sequence: string }>;
      const next = Number(rows[0].sequence);
      await manager.query(
        `INSERT INTO virtual_classroom_whiteboard_updates (classroom_id, page_key, sequence, update_data, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [classroomId, pageKey, next, data, userId],
      );
      return next;
    });
    if (sequence % 100 === 0)
      await this.compact(classroomId, pageKey, sequence);
    return { pageKey, sequence, update };
  }

  async pages(classroomId: string) {
    return this.dataSource.query(
      `SELECT page_key AS "pageKey", title, sort_order AS "sortOrder" FROM virtual_classroom_whiteboard_pages WHERE classroom_id = $1 ORDER BY sort_order, created_at`,
      [classroomId],
    );
  }

  async createPage(classroomId: string, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new BadRequestException('Page title is required');
    const pageKey = randomUUID();
    const rows = await this.dataSource.query(
      `INSERT INTO virtual_classroom_whiteboard_pages (classroom_id, page_key, title, sort_order)
       SELECT $1, $2, $3, COALESCE(MAX(sort_order), -1) + 1
       FROM virtual_classroom_whiteboard_pages WHERE classroom_id = $1
       RETURNING page_key AS "pageKey", title, sort_order AS "sortOrder"`,
      [classroomId, pageKey, cleanTitle],
    );
    return rows[0];
  }

  async renamePage(classroomId: string, pageKey: string, title: string) {
    this.assertPageKey(pageKey);
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new BadRequestException('Page title is required');
    const rows = await this.dataSource.query(
      `UPDATE virtual_classroom_whiteboard_pages SET title = $3
       WHERE classroom_id = $1 AND page_key = $2
       RETURNING page_key AS "pageKey", title, sort_order AS "sortOrder"`,
      [classroomId, pageKey, cleanTitle],
    );
    if (!rows.length)
      throw new BadRequestException('Whiteboard page not found');
    return rows[0];
  }

  async deletePage(classroomId: string, pageKey: string) {
    this.assertPageKey(pageKey);
    if (pageKey === 'main')
      throw new BadRequestException(
        'The first whiteboard page cannot be deleted',
      );
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM virtual_classroom_whiteboard_updates WHERE classroom_id = $1 AND page_key = $2`,
        [classroomId, pageKey],
      );
      await manager.query(
        `DELETE FROM virtual_classroom_whiteboard_snapshots WHERE classroom_id = $1 AND page_key = $2`,
        [classroomId, pageKey],
      );
      return manager.query(
        `DELETE FROM virtual_classroom_whiteboard_pages WHERE classroom_id = $1 AND page_key = $2 RETURNING id`,
        [classroomId, pageKey],
      );
    });
    if (!result.length)
      throw new BadRequestException('Whiteboard page not found');
    return { deleted: true };
  }

  async reorderPages(classroomId: string, pageKeys: string[]) {
    const uniqueKeys = [...new Set(pageKeys)];
    if (uniqueKeys.length !== pageKeys.length)
      throw new BadRequestException('Each whiteboard page must appear once');
    uniqueKeys.forEach((key) => this.assertPageKey(key));
    await this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT page_key AS "pageKey" FROM virtual_classroom_whiteboard_pages WHERE classroom_id = $1`,
        [classroomId],
      )) as Array<{ pageKey: string }>;
      const existing = rows.map((row) => row.pageKey).sort();
      if (
        existing.length !== uniqueKeys.length ||
        existing.some((key, index) => key !== [...uniqueKeys].sort()[index])
      )
        throw new BadRequestException(
          'Page order must include every whiteboard page',
        );
      for (const [index, key] of uniqueKeys.entries())
        await manager.query(
          `UPDATE virtual_classroom_whiteboard_pages SET sort_order = $3 WHERE classroom_id = $1 AND page_key = $2`,
          [classroomId, key, index],
        );
    });
    return this.pages(classroomId);
  }

  private async compact(
    classroomId: string,
    pageKey: string,
    sequence: number,
  ) {
    const state = await this.sync(classroomId, pageKey, 0);
    const doc = new Doc();
    if (state.snapshot)
      applyUpdate(doc, Buffer.from(state.snapshot.update, 'base64'));
    for (const item of state.updates)
      applyUpdate(doc, Buffer.from(item.update, 'base64'));
    await this.dataSource.query(
      `INSERT INTO virtual_classroom_whiteboard_snapshots (classroom_id, page_key, sequence, state_data) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [classroomId, pageKey, sequence, Buffer.from(encodeStateAsUpdate(doc))],
    );
  }

  private async ensurePage(
    classroomId: string,
    pageKey: string,
    executor: DataSource | EntityManager = this.dataSource,
  ) {
    await executor.query(
      `INSERT INTO virtual_classroom_whiteboard_pages (classroom_id, page_key, title) VALUES ($1, $2, $3) ON CONFLICT (classroom_id, page_key) DO NOTHING`,
      [classroomId, pageKey, pageKey === 'main' ? 'Board 1' : pageKey],
    );
  }

  private assertPageKey(pageKey: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(pageKey))
      throw new BadRequestException('Invalid whiteboard page');
  }
}
