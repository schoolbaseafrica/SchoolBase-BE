import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UserNotFoundException } from '../../common/exceptions/domain.exceptions';
import { Student } from '../student/entities/student.entity';

import { CreateUserDto } from './dto/create-user.dto';
import { ListAdminsQueryDto } from './dto/list-admins-query.dto';
import { User } from './entities/user.entity';
import { UserModelAction } from './model-actions/user-actions';

@Injectable()
export class UserService {
  // private readonly logger: Logger;

  constructor(
    private readonly userModelAction: UserModelAction,
    private readonly dataSource: DataSource,
  ) {
    // @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    // this.logger = logger.child({
    //   context: UserService.name,
    // });
  }

  async create(createPayload: CreateUserDto): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const newUser = await this.userModelAction.create({
        createPayload: {
          ...createPayload,
          is_active: true,
        },
        transactionOptions: { useTransaction: true, transaction: manager },
      });
      return newUser;
    });
  }

  async updateUser(
    payload: Parameters<typeof this.userModelAction.update>[0]['updatePayload'],
    identifierOptions: Parameters<
      typeof this.userModelAction.update
    >[0]['identifierOptions'],
    options?: Parameters<
      typeof this.userModelAction.update
    >[0]['transactionOptions'],
  ) {
    return this.userModelAction.update({
      updatePayload: payload,
      identifierOptions,
      transactionOptions: options ?? { useTransaction: false },
    });
  }

  async findByResetToken(resetToken: string) {
    return this.userModelAction.get({
      identifierOptions: { reset_token: resetToken },
    });
  }

  async findByEmail(email: string) {
    return this.userModelAction.get({
      identifierOptions: { email },
    });
  }

  async findByLoginIdentifier(identifier: string) {
    const value = identifier.trim();
    if (value.includes('@')) {
      return this.findByEmail(value.toLowerCase());
    }

    return this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin(Student, 'student', 'student.user_id = user.id')
      .where('UPPER(student.registration_number) = UPPER(:identifier)', {
        identifier: value,
      })
      .andWhere('student.is_deleted = false')
      .andWhere('user.deleted_at IS NULL')
      .getOne();
  }

  async findOne(id: string) {
    return this.userModelAction.get({
      identifierOptions: { id },
    });
  }

  async findAdminProfile(id: string) {
    const rows = (await this.dataSource.query(
      `SELECT "id", "first_name", "last_name", "middle_name", "email",
              "phone", "gender", "dob" AS "date_of_birth", "home_address",
              "role", "is_active", NULL::text AS "photo_url",
              "created_at" AS "join_date"
       FROM "users"
       WHERE "id" = $1 AND 'ADMIN' = ANY("role") AND "deleted_at" IS NULL`,
      [id],
    )) as Record<string, unknown>[];
    if (!rows[0]) throw new UserNotFoundException(id);
    return rows[0];
  }

  async getFirstOwner() {
    const rows = (await this.dataSource.query(
      `SELECT school."owner_user_id", usr."first_name", usr."last_name", usr."email"
       FROM "schools" school
       LEFT JOIN "users" usr ON usr."id" = school."owner_user_id"
       WHERE school."installation_completed" = true LIMIT 1`,
    )) as {
      owner_user_id: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }[];
    if (!rows[0]) throw new NotFoundException('School not found');
    return rows[0];
  }

  async assignFirstOwner(ownerUserId: string, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const schools = (await manager.query(
        `SELECT "id", "owner_user_id" FROM "schools"
         WHERE "installation_completed" = true LIMIT 1 FOR UPDATE`,
      )) as { id: string; owner_user_id: string | null }[];
      const school = schools[0];
      if (!school) throw new NotFoundException('School not found');
      if (school.owner_user_id)
        throw new ConflictException(
          'The school owner has already been assigned',
        );

      const admins = (await manager.query(
        `SELECT "id", "first_name", "last_name", "email" FROM "users"
         WHERE "id" = ANY($1::uuid[]) AND 'ADMIN' = ANY("role")
           AND "is_active" = true AND "deleted_at" IS NULL`,
        [[actorUserId, ownerUserId]],
      )) as {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
      }[];
      if (!admins.some((admin) => admin.id === actorUserId))
        throw new ForbiddenException(
          'An active admin must assign the first owner',
        );
      const owner = admins.find((admin) => admin.id === ownerUserId);
      if (!owner)
        throw new NotFoundException('Select an active admin as school owner');

      await manager.query(
        `UPDATE "schools" SET "owner_user_id" = $1, "updated_at" = now()
         WHERE "id" = $2`,
        [ownerUserId, school.id],
      );
      await manager.query(
        `INSERT INTO "activity_logs" ("user_id", "entity_type", "entity_id", "action", "description", "new_values")
         VALUES ($1, 'school', $2, 'ASSIGN_OWNER', 'First school owner assigned', $3::jsonb)`,
        [
          actorUserId,
          school.id,
          JSON.stringify({ owner_user_id: ownerUserId }),
        ],
      );
      await manager.query(
        `INSERT INTO "notifications" ("recipient_id", "title", "message", "type", "is_read")
         SELECT "id", 'School owner assigned', $1, 'SYSTEM_ALERT', false
         FROM "users" WHERE 'ADMIN' = ANY("role")
           AND "is_active" = true AND "deleted_at" IS NULL`,
        [
          `${owner.first_name} ${owner.last_name} has been assigned as the school owner.`,
        ],
      );
      return {
        owner_user_id: owner.id,
        first_name: owner.first_name,
        last_name: owner.last_name,
        email: owner.email,
      };
    });
  }

  async transferOwner(newOwnerUserId: string, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const schools = (await manager.query(
        `SELECT "id", "owner_user_id" FROM "schools"
         WHERE "installation_completed" = true LIMIT 1 FOR UPDATE`,
      )) as { id: string; owner_user_id: string | null }[];
      const school = schools[0];
      if (!school || school.owner_user_id !== actorUserId)
        throw new ForbiddenException(
          'Only the current school owner can transfer ownership',
        );
      if (newOwnerUserId === actorUserId)
        throw new ConflictException(
          'Select a different admin as the new owner',
        );

      const admins = (await manager.query(
        `SELECT "id", "first_name", "last_name", "email" FROM "users"
         WHERE "id" = ANY($1::uuid[]) AND 'ADMIN' = ANY("role")
           AND "is_active" = true AND "deleted_at" IS NULL FOR UPDATE`,
        [[actorUserId, newOwnerUserId]],
      )) as {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
      }[];
      if (!admins.some((admin) => admin.id === actorUserId))
        throw new ForbiddenException('The school owner account is inactive');
      const newOwner = admins.find((admin) => admin.id === newOwnerUserId);
      if (!newOwner)
        throw new NotFoundException('Select an active admin as the new owner');

      await manager.query(
        `UPDATE "schools" SET "owner_user_id" = $1, "updated_at" = now()
         WHERE "id" = $2`,
        [newOwnerUserId, school.id],
      );
      await manager.query(
        `INSERT INTO "activity_logs" ("user_id", "entity_type", "entity_id", "action", "description", "old_values", "new_values")
         VALUES ($1, 'school', $2, 'TRANSFER_OWNER', 'School ownership transferred', $3::jsonb, $4::jsonb)`,
        [
          actorUserId,
          school.id,
          JSON.stringify({ owner_user_id: actorUserId }),
          JSON.stringify({ owner_user_id: newOwnerUserId }),
        ],
      );
      await manager.query(
        `INSERT INTO "notifications" ("recipient_id", "title", "message", "type", "is_read")
         SELECT "id", 'School ownership transferred', $1, 'SYSTEM_ALERT', false
         FROM "users" WHERE 'ADMIN' = ANY("role")
           AND "is_active" = true AND "deleted_at" IS NULL`,
        [
          `${newOwner.first_name} ${newOwner.last_name} is now the school owner.`,
        ],
      );
      return {
        owner_user_id: newOwner.id,
        first_name: newOwner.first_name,
        last_name: newOwner.last_name,
        email: newOwner.email,
      };
    });
  }

  async setAdminActive(
    targetUserId: string,
    actorUserId: string,
    isActive: boolean,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const schools = (await manager.query(
        `SELECT "id", "owner_user_id" FROM "schools"
         WHERE "installation_completed" = true LIMIT 1 FOR UPDATE`,
      )) as { id: string; owner_user_id: string | null }[];
      const school = schools[0];
      if (!school || school.owner_user_id !== actorUserId)
        throw new ForbiddenException(
          'Only the school owner can change admin access',
        );

      const admins = (await manager.query(
        `SELECT "id", "first_name", "last_name", "email", "is_active"
         FROM "users" WHERE "id" = ANY($1::uuid[]) AND 'ADMIN' = ANY("role")
           AND "deleted_at" IS NULL FOR UPDATE`,
        [[actorUserId, targetUserId]],
      )) as {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        is_active: boolean;
      }[];
      const actor = admins.find((admin) => admin.id === actorUserId);
      if (!actor?.is_active)
        throw new ForbiddenException('The school owner account is inactive');
      const target = admins.find((admin) => admin.id === targetUserId);
      if (!target) throw new NotFoundException('Admin not found');
      if (targetUserId === actorUserId && !isActive)
        throw new ForbiddenException(
          'The school owner cannot deactivate their own account',
        );
      if (target.is_active === isActive)
        throw new ConflictException(
          `Admin is already ${isActive ? 'active' : 'inactive'}`,
        );

      await manager.query(
        `UPDATE "users" SET "is_active" = $1, "reset_token" = NULL,
           "reset_token_expiry" = NULL, "updated_at" = now() WHERE "id" = $2`,
        [isActive, targetUserId],
      );
      if (!isActive) {
        await manager.query(
          `UPDATE "sessions" SET "is_active" = false, "revoked_at" = now()
           WHERE "user_id" = $1 AND "is_active" = true`,
          [targetUserId],
        );
      }
      await manager.query(
        `INSERT INTO "activity_logs" ("user_id", "entity_type", "entity_id", "action", "description", "old_values", "new_values")
         VALUES ($1, 'user', $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          actorUserId,
          targetUserId,
          isActive ? 'ACTIVATE' : 'DEACTIVATE',
          `Admin ${isActive ? 'reactivated' : 'deactivated'} by school owner`,
          JSON.stringify({ is_active: target.is_active }),
          JSON.stringify({ is_active: isActive }),
        ],
      );
      return {
        id: target.id,
        first_name: target.first_name,
        last_name: target.last_name,
        email: target.email,
        is_active: isActive,
      };
    });
  }

  async findAdmins(query: ListAdminsQueryDto) {
    const { page = 1, limit = 20, search, is_active } = query;
    const parameters: unknown[] = [];
    const conditions = [`'ADMIN' = ANY("role")`, `"deleted_at" IS NULL`];

    if (is_active !== undefined) {
      parameters.push(is_active);
      conditions.push(`"is_active" = $${parameters.length}`);
    }

    if (search?.trim()) {
      parameters.push(`%${search.trim()}%`);
      const parameter = `$${parameters.length}`;
      conditions.push(
        `("first_name" ILIKE ${parameter} OR "last_name" ILIKE ${parameter} OR "email" ILIKE ${parameter})`,
      );
    }

    const where = conditions.join(' AND ');
    const countRows = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS "total" FROM "users" WHERE ${where}`,
      [...parameters],
    )) as { total: number }[];
    const total = Number(countRows[0]?.total ?? 0);

    parameters.push(limit, (page - 1) * limit);
    const data = (await this.dataSource.query(
      `SELECT
        "id", "first_name", "last_name", "middle_name", "email", "phone",
        "gender", "dob" AS "date_of_birth", "home_address", "role",
        "is_active", "deleted_at", NULL::text AS "photo_url",
        "created_at" AS "join_date"
       FROM "users"
       WHERE ${where}
       ORDER BY "last_name" ASC, "first_name" ASC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )) as Record<string, unknown>[];

    return {
      data,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }
}
