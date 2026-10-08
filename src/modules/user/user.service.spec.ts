import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { UserNotFoundException } from '../../common/exceptions/domain.exceptions';

import { User } from './entities/user.entity';
import { UserModelAction } from './model-actions/user-actions';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let userModelAction: jest.Mocked<UserModelAction>;

  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
    query: jest.fn(),
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    }),
  };

  const mockUserModelAction = {
    get: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserModelAction,
          useValue: mockUserModelAction,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userModelAction = module.get(UserModelAction);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      const fakeUser = {
        id: '123',
        email: 'test@example.com',
      } as unknown as User;

      userModelAction.get.mockResolvedValue(fakeUser);

      const result = await service.findOne('123');

      expect(userModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: '123' },
      });

      expect(result).toEqual(fakeUser);
    });

    it('should return null when user is not found', async () => {
      userModelAction.get.mockResolvedValue(null);

      const result = await service.findOne('invalid-id');

      expect(userModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: 'invalid-id' },
      });

      expect(result).toBeNull();
    });
  });

  it('returns an admin profile without credentials or reset tokens', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { id: 'admin-id', first_name: 'Ada', email: 'ada@example.com' },
    ]);
    const profile = await service.findAdminProfile('admin-id');
    expect(profile).not.toHaveProperty('password');
    expect(profile).not.toHaveProperty('reset_token');
    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(`'ADMIN' = ANY("role")`),
      ['admin-id'],
    );
  });

  it('does not disclose non-admin profiles through the admin endpoint', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);
    await expect(service.findAdminProfile('student-id')).rejects.toBeInstanceOf(
      UserNotFoundException,
    );
  });

  describe('findByLoginIdentifier', () => {
    it('uses the existing email lookup for email identifiers', async () => {
      const user = { id: 'user-id', email: 'student@example.com' } as User;
      userModelAction.get.mockResolvedValue(user);

      const result = await service.findByLoginIdentifier(
        ' Student@Example.com ',
      );

      expect(userModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { email: 'student@example.com' },
      });
      expect(mockDataSource.getRepository).not.toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('finds the student user by registration number without case sensitivity', async () => {
      const user = { id: 'student-user-id' } as User;
      queryBuilder.getOne.mockResolvedValue(user);

      const result = await service.findByLoginIdentifier(' sb/2026/0001 ');

      expect(mockDataSource.getRepository).toHaveBeenCalledWith(User);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'UPPER(student.registration_number) = UPPER(:identifier)',
        { identifier: 'sb/2026/0001' },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'student.is_deleted = false',
      );
      expect(result).toBe(user);
    });
  });

  describe('findAdmins', () => {
    it('returns active admin users using the frontend response contract', async () => {
      const admins = [
        {
          id: 'admin-id',
          first_name: 'Ada',
          last_name: 'Admin',
          is_active: true,
        },
      ];
      mockDataSource.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(admins);

      const result = await service.findAdmins({
        page: 1,
        limit: 100,
        is_active: true,
      });

      expect(result).toEqual({
        data: admins,
        total: 1,
        page: 1,
        limit: 100,
        total_pages: 1,
      });
      expect(mockDataSource.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(`'ADMIN' = ANY("role")`),
        [true],
      );
      expect(mockDataSource.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('AS "date_of_birth"'),
        [true, 100, 0],
      );
    });
  });

  describe('update', () => {
    it('should call userModelAction.update with default transactionOptions', async () => {
      type UpdateArgs = Parameters<typeof userModelAction.update>[0];

      const payload: UpdateArgs['updatePayload'] = {
        email: 'updated@example.com',
      };

      const identifierOptions: UpdateArgs['identifierOptions'] = {
        id: '123',
      };

      const updatedUser = {
        id: '123',
        email: 'updated@example.com',
      } as unknown as User;

      userModelAction.update.mockResolvedValue(updatedUser);

      const result = await service.updateUser(payload, identifierOptions);

      expect(userModelAction.update).toHaveBeenCalledWith({
        updatePayload: payload,
        identifierOptions,
        transactionOptions: { useTransaction: false },
      });

      expect(result).toEqual(updatedUser);
    });
  });

  describe('assignFirstOwner', () => {
    const actor = {
      id: '00000000-0000-4000-8000-000000000001',
      first_name: 'Ada',
      last_name: 'Admin',
      email: 'ada@example.com',
    };
    const owner = {
      id: '00000000-0000-4000-8000-000000000002',
      first_name: 'Ola',
      last_name: 'Owner',
      email: 'ola@example.com',
    };
    let managerQuery: jest.Mock;

    beforeEach(() => {
      managerQuery = jest.fn();
      mockDataSource.transaction.mockImplementation((callback) =>
        callback({ query: managerQuery }),
      );
    });

    it('assigns one active admin and records and announces the decision', async () => {
      managerQuery
        .mockResolvedValueOnce([{ id: 'school-id', owner_user_id: null }])
        .mockResolvedValueOnce([actor, owner])
        .mockResolvedValue([]);

      await expect(
        service.assignFirstOwner(owner.id, actor.id),
      ).resolves.toEqual({
        owner_user_id: owner.id,
        first_name: owner.first_name,
        last_name: owner.last_name,
        email: owner.email,
      });
      expect(managerQuery.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(managerQuery.mock.calls[2][0]).toContain('UPDATE "schools"');
      expect(managerQuery.mock.calls[3][0]).toContain(
        'INSERT INTO "activity_logs"',
      );
      expect(managerQuery.mock.calls[4][0]).toContain(
        'INSERT INTO "notifications"',
      );
    });

    it('refuses a second owner assignment', async () => {
      managerQuery.mockResolvedValueOnce([
        { id: 'school-id', owner_user_id: owner.id },
      ]);
      await expect(
        service.assignFirstOwner(actor.id, actor.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects inactive or non-admin targets', async () => {
      managerQuery
        .mockResolvedValueOnce([{ id: 'school-id', owner_user_id: null }])
        .mockResolvedValueOnce([actor]);
      await expect(
        service.assignFirstOwner(owner.id, actor.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires the actor to remain an active admin', async () => {
      managerQuery
        .mockResolvedValueOnce([{ id: 'school-id', owner_user_id: null }])
        .mockResolvedValueOnce([owner]);
      await expect(
        service.assignFirstOwner(owner.id, actor.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('setAdminActive', () => {
    const owner = { id: 'owner-id', is_active: true };
    const admin = {
      id: 'admin-id',
      first_name: 'Ada',
      last_name: 'Admin',
      email: 'ada@example.com',
      is_active: true,
    };
    let query: jest.Mock;

    beforeEach(() => {
      query = jest.fn();
      mockDataSource.transaction.mockImplementation((callback) =>
        callback({ query }),
      );
    });

    it('requires the current school owner', async () => {
      query.mockResolvedValueOnce([
        { id: 'school-id', owner_user_id: 'other-id' },
      ]);
      await expect(
        service.setAdminActive(admin.id, owner.id, false),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('deactivates an admin and revokes their sessions in the transaction', async () => {
      query
        .mockResolvedValueOnce([{ id: 'school-id', owner_user_id: owner.id }])
        .mockResolvedValueOnce([owner, admin])
        .mockResolvedValue([]);
      await expect(
        service.setAdminActive(admin.id, owner.id, false),
      ).resolves.toMatchObject({ id: admin.id, is_active: false });
      expect(query.mock.calls[2][0]).toContain('UPDATE "users"');
      expect(query.mock.calls[3][0]).toContain('UPDATE "sessions"');
      expect(query.mock.calls[4][0]).toContain('INSERT INTO "activity_logs"');
    });

    it('reactivates without reviving old sessions', async () => {
      query
        .mockResolvedValueOnce([{ id: 'school-id', owner_user_id: owner.id }])
        .mockResolvedValueOnce([owner, { ...admin, is_active: false }])
        .mockResolvedValue([]);
      await expect(
        service.setAdminActive(admin.id, owner.id, true),
      ).resolves.toMatchObject({ id: admin.id, is_active: true });
      expect(
        query.mock.calls.some(([sql]) => sql.includes('UPDATE "sessions"')),
      ).toBe(false);
    });

    it('prevents owner self-deactivation', async () => {
      query
        .mockResolvedValueOnce([{ id: 'school-id', owner_user_id: owner.id }])
        .mockResolvedValueOnce([owner]);
      await expect(
        service.setAdminActive(owner.id, owner.id, false),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
