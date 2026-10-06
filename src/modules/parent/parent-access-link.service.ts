import { createHash, randomBytes, randomUUID } from 'crypto';

import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { AuthService } from '../auth/auth.service';

import { Parent } from './entities/parent.entity';

type LinkRow = {
  id: string;
  parent_id: string;
  is_active: boolean;
  is_single_use: boolean;
  expires_at: Date;
  used_at: Date | null;
  used_by_ip: string | null;
  created_at: Date;
  created_by: string;
};

@Injectable()
export class ParentAccessLinkService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private async activeParent(parentId: string) {
    const parent = await this.dataSource.getRepository(Parent).findOne({
      where: { id: parentId, is_active: true },
      relations: ['user'],
    });
    if (!parent || !parent.user?.is_active) {
      throw new NotFoundException('Active parent account not found');
    }
    return parent;
  }

  async generate(
    parentId: string,
    adminId: string,
    expiresInHours = 24,
    isSingleUse = true,
  ) {
    await this.activeParent(parentId);
    const base = this.config.get<string>('frontend.url')?.replace(/\/+$/, '');
    if (!base || !/^https?:\/\//.test(base)) {
      throw new ForbiddenException('School frontend URL is not configured');
    }
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const id = randomUUID();
    const rows = (await this.dataSource.query(
      `INSERT INTO "parent_access_links"
       ("id", "parent_id", "token_hash", "created_by", "expires_at", "is_single_use")
       VALUES ($1, $2, $3, $4, now() + ($5 * interval '1 hour'), $6)
       RETURNING "expires_at"`,
      [id, parentId, hash, adminId, expiresInHours, isSingleUse],
    )) as Pick<LinkRow, 'expires_at'>[];
    const link = `${base}/parent/auto-login#${encodeURIComponent(token)}`;
    return {
      id,
      link,
      token,
      expires_at: rows[0].expires_at,
      is_single_use: isSingleUse,
      requires_password_reset: false,
      email_sent: false,
    };
  }

  async list(parentId: string) {
    await this.activeParent(parentId);
    const rows = (await this.dataSource.query(
      `SELECT l."id", l."created_at", l."expires_at", l."used_at",
              l."used_by_ip", l."is_active", l."is_single_use",
              u."id" AS "created_by_id", u."first_name", u."last_name"
       FROM "parent_access_links" l
       LEFT JOIN "users" u ON u."id" = l."created_by"
       WHERE l."parent_id" = $1 ORDER BY l."created_at" DESC`,
      [parentId],
    )) as (LinkRow & {
      created_by_id: string;
      first_name: string;
      last_name: string;
    })[];
    return rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      expires_at: row.expires_at,
      used_at: row.used_at,
      used_by_ip: row.used_by_ip,
      is_active: row.is_active,
      is_single_use: row.is_single_use,
      created_by: row.created_by_id
        ? {
            id: row.created_by_id,
            name: `${row.first_name} ${row.last_name}`.trim(),
          }
        : null,
    }));
  }

  async revoke(linkId: string) {
    const rows = (await this.dataSource.query(
      `UPDATE "parent_access_links" SET "is_active" = false, "updated_at" = now()
       WHERE "id" = $1 RETURNING "id"`,
      [linkId],
    )) as { id: string }[];
    if (!rows.length)
      throw new NotFoundException('Parent access link not found');
    return { revoked: true };
  }

  async validate(token: string, ip?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '')) {
      throw new GoneException('Parent access link is invalid or expired');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT "id", "parent_id", "is_active", "is_single_use", "expires_at", "used_at",
                "expires_at" <= now() AS "expired"
         FROM "parent_access_links" WHERE "token_hash" = $1 FOR UPDATE`,
        [hash],
      )) as (LinkRow & { expired: boolean })[];
      const link = rows[0];
      if (
        !link ||
        !link.is_active ||
        link.expired ||
        (link.is_single_use && link.used_at)
      ) {
        throw new GoneException('Parent access link is invalid or expired');
      }
      const parent = await manager.findOne(Parent, {
        where: { id: link.parent_id, is_active: true },
        relations: ['user'],
      });
      if (!parent || !parent.user?.is_active) {
        throw new GoneException('Parent access link is invalid or expired');
      }
      const session = await this.auth.createParentLinkSession(parent.user);
      await manager.query(
        `UPDATE "parent_access_links"
         SET "used_at" = now(), "used_by_ip" = $2, "updated_at" = now(),
             "is_active" = CASE WHEN "is_single_use" THEN false ELSE "is_active" END
         WHERE "id" = $1`,
        [link.id, ip?.slice(0, 45) ?? null],
      );
      return session;
    });
  }
}
