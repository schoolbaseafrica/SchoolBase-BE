import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ApiSuccessResponseDto } from '../../common/dto/response.dto';
import { UserNotFoundException } from '../../common/exceptions/domain.exceptions';
import * as sysMsg from '../../constants/system.messages';

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

  async findOne(id: string) {
    return this.userModelAction.get({
      identifierOptions: { id },
    });
  }

  async findAdmins(query: ListAdminsQueryDto) {
    const { page = 1, limit = 20, search, is_active } = query;
    const parameters: unknown[] = [];
    const conditions = [`'ADMIN' = ANY("role")`];

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

  async remove(id: string) {
    const user = await this.userModelAction.get({
      identifierOptions: { id },
    });
    if (!user || user.deleted_at) {
      throw new UserNotFoundException(id);
    }
    await this.userModelAction.update({
      identifierOptions: { id },
      updatePayload: { deleted_at: new Date() },
      transactionOptions: { useTransaction: false },
    });
    return new ApiSuccessResponseDto(sysMsg.ACCOUNT_DELETED);
  }
}
