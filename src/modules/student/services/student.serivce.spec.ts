import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import * as sysMsg from '../../../constants/system.messages';
import { SessionStatus } from '../../academic-session/entities/academic-session.entity';
import { AcademicSessionModelAction } from '../../academic-session/model-actions/academic-session-actions';
import { ClassStudentModelAction } from '../../class/model-actions/class-student.action';
import { ClassModelAction } from '../../class/model-actions/class.actions';
import { AccountCreationService } from '../../email/account-creation.service';
import { IUserPayload } from '../../parent/parent.service';
import { UserRole } from '../../shared/enums';
import { FileService } from '../../shared/file/file.service';
import { User } from '../../user/entities/user.entity';
import { UserModelAction } from '../../user/model-actions/user-actions';
import { StudentProfileResponseDto } from '../dto';
import { ListStudentsDto } from '../dto/list-student.dto';
import { StudentGrowthInterval } from '../dto/student.growth.dto';
import { Student } from '../entities';
import { StudentModelAction } from '../model-actions';

import { StudentService } from './student.service';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as unknown as jest.Mocked<Logger>;

const mockStudentModelAction = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  generateRegistrationNumber: jest.fn(),
  repository: undefined as { createQueryBuilder: jest.Mock } | undefined,
};

const mockUserModelAction = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn(),
  query: jest.fn(),
  getRepository: jest.fn(),
};

const mockFileService = {
  validatePhotoUrl: jest.fn(),
} as unknown as jest.Mocked<FileService>;

const mockClassStudentModelAction = { list: jest.fn(), create: jest.fn() };
const mockClassModelAction = { find: jest.fn() };
const mockAcademicSessionModelAction = { find: jest.fn(), get: jest.fn() };

describe('StudentService', () => {
  let service: StudentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
        {
          provide: StudentModelAction,
          useValue: mockStudentModelAction,
        },
        {
          provide: UserModelAction,
          useValue: mockUserModelAction,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: FileService,
          useValue: mockFileService,
        },
        {
          provide: ClassStudentModelAction,
          useValue: mockClassStudentModelAction,
        },
        {
          provide: ClassModelAction,
          useValue: mockClassModelAction,
        },
        {
          provide: AcademicSessionModelAction,
          useValue: mockAcademicSessionModelAction,
        },
        {
          provide: AccountCreationService,
          useValue: {
            sendAccountCreationEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
  });

  it('returns snake-case pagination metadata for period-filtered lists', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(21),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockStudentModelAction.repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const result = await service.findAll({
      page: 2,
      limit: 10,
      session_id: '00000000-0000-0000-0000-000000000001',
    } as ListStudentsDto);

    expect(result.meta).toMatchObject({
      total: 21,
      page: 2,
      limit: 10,
      total_pages: 3,
      has_next: true,
      has_previous: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('serializes auto student IDs through the creating transaction', async () => {
    const generatedId = `STU-${new Date().getFullYear()}-0008`;
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ last: 7 }]),
    };
    mockDataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        student_id_prefix: 'STU',
        school_code: '',
      }),
    });
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    mockUserModelAction.get.mockResolvedValue(null);
    mockStudentModelAction.get.mockResolvedValue(null);
    mockUserModelAction.create.mockResolvedValue({
      id: 'user-id',
      first_name: 'A',
      last_name: 'B',
      email: 'a@example.test',
    });
    mockStudentModelAction.create.mockResolvedValue({
      id: 'student-id',
      registration_number: generatedId,
    });
    await service.create(
      {
        first_name: 'A',
        last_name: 'B',
        email: 'a@example.test',
        password: 'Password123!',
        date_of_birth: '2010-01-01',
      } as never,
      'admin-1',
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        "pg_advisory_xact_lock(hashtext('schoolbase:student-id'))",
      ),
    );
    expect(mockStudentModelAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createPayload: expect.objectContaining({
          registration_number: generatedId,
        }),
        transactionOptions: expect.objectContaining({ transaction: manager }),
      }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "activity_logs"'),
      expect.arrayContaining(['admin-1', 'STUDENT', 'student-id', 'CREATE']),
    );
  });

  it('creates a student without email and does not attempt to send an invitation', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ last: 0 }]),
    };
    mockDataSource.getRepository.mockReturnValue({
      findOne: jest
        .fn()
        .mockResolvedValue({ student_id_prefix: 'STU', school_code: '' }),
    });
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    mockUserModelAction.get.mockResolvedValue(null);
    mockStudentModelAction.get.mockResolvedValue(null);
    mockUserModelAction.create.mockResolvedValue({
      id: 'user-no-email',
      first_name: 'A',
      last_name: 'B',
      email: null,
    });
    mockStudentModelAction.create.mockResolvedValue({
      id: 'student-no-email',
      registration_number: 'STU-2026-0001',
    });
    await service.create({
      first_name: 'A',
      last_name: 'B',
      password: 'Password123!',
      date_of_birth: '2010-01-01',
    } as never);
    expect(mockUserModelAction.get).not.toHaveBeenCalled();
    expect(mockUserModelAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createPayload: expect.objectContaining({ email: null }),
      }),
    );
    const accountCreationService = Reflect.get(
      service,
      'accountCreationService',
    ) as {
      sendAccountCreationEmail: jest.Mock;
    };
    expect(
      accountCreationService.sendAccountCreationEmail,
    ).not.toHaveBeenCalled();
  });

  it('resets a no-email student password without logging the new secret', async () => {
    mockStudentModelAction.get.mockResolvedValue({
      id: 'student-1',
      registration_number: 'STU-2026-0001',
      is_deleted: false,
      user: { id: 'user-1', email: null, is_active: true },
    });
    const manager = { query: jest.fn().mockResolvedValue([]) };
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    const result = await service.resetPasswordWithoutEmail(
      'student-1',
      'admin-1',
    );
    expect(result.registration_number).toBe('STU-2026-0001');
    expect(result.password.length).toBeGreaterThanOrEqual(20);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "sessions"'),
      ['user-1'],
    );
    const auditCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "activity_logs"'),
    );
    expect(auditCall).toBeDefined();
    expect(JSON.stringify(auditCall)).not.toContain(result.password);
  });

  it('creates the selected current-session class enrollment in the student transaction', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          id: 'class-1',
          academicSession: { id: 'session-1', status: SessionStatus.ACTIVE },
        }),
      }),
    };
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    mockDataSource.getRepository.mockReturnValue({
      findOne: jest
        .fn()
        .mockResolvedValue({ student_id_prefix: 'STU', school_code: '' }),
    });
    mockUserModelAction.get.mockResolvedValue(null);
    mockUserModelAction.create.mockResolvedValue({
      id: 'user-1',
      first_name: 'Ada',
      last_name: 'QA',
      email: 'ada@example.test',
    });
    mockStudentModelAction.create.mockResolvedValue({
      id: 'student-1',
      registration_number: '0043',
      current_class_id: null,
    });
    mockStudentModelAction.update.mockResolvedValue({});
    const result = await service.create({
      first_name: 'Ada',
      last_name: 'QA',
      email: 'ada@example.test',
      password: 'Password123!',
      date_of_birth: '2010-01-01',
      class_id: 'class-1',
    } as never);
    expect(mockClassStudentModelAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createPayload: expect.objectContaining({
          class: { id: 'class-1' },
          student: { id: 'student-1' },
          session_id: 'session-1',
          is_active: true,
        }),
        transactionOptions: { useTransaction: true, transaction: manager },
      }),
    );
    expect(mockStudentModelAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updatePayload: { current_class_id: 'class-1' },
        transactionOptions: { useTransaction: true, transaction: manager },
      }),
    );
    expect(result.current_class_id).toBe('class-1');
  });

  it('rejects an archived class before creating a student account', async () => {
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }),
    };
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    mockUserModelAction.get.mockResolvedValue(null);
    await expect(
      service.create({
        email: 'ada@example.test',
        password: 'Password123!',
        date_of_birth: '2010-01-01',
        class_id: 'class-1',
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(mockUserModelAction.create).not.toHaveBeenCalled();
  });

  it('deactivates class enrollment and clears the current class with the student account', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    mockStudentModelAction.get.mockResolvedValue({
      id: 'student-1',
      is_deleted: false,
      user: { id: 'user-1' },
    });
    mockUserModelAction.update.mockResolvedValue({});
    mockStudentModelAction.update.mockResolvedValue({});
    await service.remove('student-1', 'admin-1');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE "class_students" SET "is_active" = false',
      ),
      ['student-1'],
    );
    expect(mockStudentModelAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        updatePayload: expect.objectContaining({
          is_deleted: true,
          current_class_id: null,
        }),
        transactionOptions: { useTransaction: true, transaction: manager },
      }),
    );
  });

  it('rejects a manual student ID taken while waiting for the ID lock', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ present: 1 }]),
    };
    mockDataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ allow_manual_student_ids: true }),
    });
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    mockUserModelAction.get.mockResolvedValue(null);
    mockStudentModelAction.get.mockResolvedValue(null);
    await expect(
      service.create({
        email: 'a@example.test',
        registration_number: 'STU-2026-0001',
        password: 'Password123!',
        date_of_birth: '2010-01-01',
      } as never),
    ).rejects.toThrow(ConflictException);
    expect(mockUserModelAction.create).not.toHaveBeenCalled();
  });

  describe('getStudentGrowthReport', () => {
    it('groups first enrollments by month within the selected session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-01T00:00:00Z'));
      mockAcademicSessionModelAction.get.mockResolvedValue({
        id: 'session-1',
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-10-31'),
      });
      mockDataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { studentId: 'student-1', enrollmentDate: '2026-09-10T10:00:00Z' },
        { studentId: 'student-2', enrollmentDate: '2026-10-02T10:00:00Z' },
      ]);

      const result = await service.getStudentGrowthReport({
        session_id: 'session-1',
        interval: StudentGrowthInterval.MONTH,
      });

      expect(result.data.report).toEqual([
        expect.objectContaining({
          label: 'Sep 2026',
          new_students: 1,
          cumulative_students: 1,
        }),
        expect.objectContaining({
          label: 'Oct 2026',
          new_students: 1,
          cumulative_students: 2,
        }),
      ]);
      jest.useRealTimers();
    });

    it('does not include future months in the active reporting period', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-24T12:00:00Z'));
      mockAcademicSessionModelAction.get.mockResolvedValue({
        id: 'session-1',
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-31'),
      });
      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { studentId: 'student-1', enrollmentDate: '2026-09-10T10:00:00Z' },
        ]);

      const result = await service.getStudentGrowthReport({
        session_id: 'session-1',
        interval: StudentGrowthInterval.MONTH,
      });

      expect(result.data.report).toEqual([
        expect.objectContaining({
          label: 'Sep 2026',
          end_date: '2026-09-24',
          new_students: 1,
          cumulative_students: 1,
        }),
      ]);
      jest.useRealTimers();
    });
  });

  describe('getMyProfile', () => {
    const studentId = 'a-student-uuid';
    const userId = 'user-uuid';

    const mockAuthUser: IUserPayload = {
      id: userId,
      email: 'student@test.com',
      roles: [UserRole.STUDENT],
    };

    const mockAdminUser: IUserPayload = {
      id: 'admin-user-uuid',
      email: 'admin@test.com',
      roles: [UserRole.ADMIN],
    };

    it('should return the student profile when found', async () => {
      // Arrange
      const mockUser = { id: userId, email: 'student@test.com' } as User;
      // The mockStudent needs to have the full nested structure expected by StudentProfileResponseDto
      const mockStudent = {
        id: studentId,
        is_deleted: false,
        user: mockUser,
        stream: {
          id: 'stream-uuid',
          name: 'Stream A',
          class: {
            id: 'class-uuid',
            name: 'JSS1',
            academicSession: {
              id: 'session-uuid',
              academicYear: '2023/2024',
              name: '2023/2024 Session',
              startDate: new Date('2023-09-01'),
              endDate: new Date('2024-06-30'),
            },
          },
        },
      } as Student;
      const expectedResponse = new StudentProfileResponseDto(
        mockStudent,
        mockUser,
        sysMsg.PROFILE_RETRIEVED,
      );

      mockStudentModelAction.get.mockResolvedValue(mockStudent);

      // Act
      const result = await service.getMyProfile(studentId, mockAuthUser);

      // Assert
      expect(mockStudentModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: studentId },
        relations: {
          user: true,
          stream: {
            class: {
              academicSession: true,
              teacher_assignment: true,
              classSubjects: true,
              timetable: { schedules: true },
            },
          },
        },
      });
      expect(result).toEqual(expectedResponse);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Fetched student profile for student ID: ${studentId}`,
      );
    });

    it('should throw NotFoundException if student profile is not found', async () => {
      // Arrange
      mockStudentModelAction.get.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getMyProfile(studentId, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `Student profile not found with ID: ${studentId}`,
      );
    });

    it('should throw NotFoundException if student profile is soft-deleted', async () => {
      // Arrange
      const mockStudent = { id: 'a-student-uuid', is_deleted: true } as Student;
      mockStudentModelAction.get.mockResolvedValue(mockStudent);

      // Act & Assert
      await expect(
        service.getMyProfile(studentId, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if a student tries to access another student profile', async () => {
      // Arrange
      const otherUserId = 'another-user-uuid';
      const mockUser = { id: otherUserId, email: 'other@test.com' } as User;
      const mockStudent = {
        id: studentId,
        is_deleted: false,
        user: mockUser,
      } as Student;

      mockStudentModelAction.get.mockResolvedValue(mockStudent);

      // Act & Assert
      await expect(
        service.getMyProfile(studentId, mockAuthUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `Forbidden access attempt to student profile ${studentId} by user ${mockAuthUser.id}`,
      );
    });

    it('should allow an admin to access any student profile', async () => {
      // Arrange
      const mockUser = { id: userId, email: 'student@test.com' } as User;
      const mockStudent = {
        id: studentId,
        is_deleted: false,
        user: mockUser,
      } as Student;
      mockStudentModelAction.get.mockResolvedValue(mockStudent);

      // Act & Assert
      await expect(
        service.getMyProfile(studentId, mockAdminUser),
      ).resolves.toBeInstanceOf(StudentProfileResponseDto);
    });
  });

  describe('getAcademicContext', () => {
    const studentId = 'student-id';
    const sessionId = 'session-id';
    const authUser: IUserPayload = {
      id: 'user-id',
      email: 'student@test.com',
      roles: [UserRole.STUDENT],
    };

    it('returns the active class assignment for the selected session', async () => {
      mockStudentModelAction.get.mockResolvedValue({
        id: studentId,
        is_deleted: false,
        user: { id: authUser.id },
      } as Student);
      mockClassStudentModelAction.list.mockResolvedValue({
        payload: [
          {
            class: {
              id: 'class-id',
              name: 'JSS 3',
              arm: 'A',
              academicSession: { id: sessionId, name: '2026/2027' },
            },
          },
        ],
        paginationMeta: {},
      });

      const result = await service.getAcademicContext(
        studentId,
        sessionId,
        authUser,
      );

      expect(mockClassStudentModelAction.list).toHaveBeenCalledWith({
        filterRecordOptions: {
          student: { id: studentId },
          session_id: sessionId,
          is_active: true,
        },
        relations: { class: { academicSession: true } },
        paginationPayload: { page: 1, limit: 1 },
      });
      expect(result.class_details).toEqual({
        id: 'class-id',
        name: 'JSS 3 A',
        arm: 'A',
      });
    });

    it('returns no class when the student has no enrollment in that session', async () => {
      mockStudentModelAction.get.mockResolvedValue({
        id: studentId,
        is_deleted: false,
        user: { id: authUser.id },
      } as Student);
      mockClassStudentModelAction.list.mockResolvedValue({
        payload: [],
        paginationMeta: {},
      });

      const result = await service.getAcademicContext(
        studentId,
        sessionId,
        authUser,
      );

      expect(result).toEqual({ class_details: null, academic_details: null });
    });
  });
});
