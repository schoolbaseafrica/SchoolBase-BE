import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';

import { IRequestWithUser } from '../../../common/types/request.interface';
import * as sysMsg from '../../../constants/system.messages';
import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { AcademicSessionModelAction } from '../../academic-session/model-actions/academic-session-actions';
import { TermModelAction } from '../../academic-term/model-actions';
import { ScheduleBasedAttendanceController } from '../controllers/schedule-based-attendance.controller';
import { StudentDailyAttendanceController } from '../controllers/student-daily-attendance.controller';
import { CreateEditRequestDto, ReviewEditRequestDto } from '../dto';
import { AttendanceEditRequest } from '../entities/student-daily-attendance.entity';
import {
  AttendanceType,
  EditRequestStatus,
} from '../enums/attendance-status.enum';
import {
  AttendanceModelAction,
  StudentDailyAttendanceModelAction,
  AttendanceEditRequestModelAction,
} from '../model-actions';
import { AttendanceService } from '../services/attendance.service';

describe('ScheduleBasedAttendanceController', () => {
  let controller: ScheduleBasedAttendanceController;
  let module: TestingModule;

  beforeEach(async () => {
    const mockAttendanceModelAction = {
      create: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockStudentDailyAttendanceModelAction = {
      create: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockAcademicSessionModelAction = {
      list: jest.fn(),
      get: jest.fn(),
    };

    const mockAcademicSessionService = {
      activeSessions: jest.fn(),
    };

    const mockTermModelAction = {
      get: jest.fn(),
      list: jest.fn(),
    };

    const mockEditRequestModelAction = {
      create: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleBasedAttendanceController],
      providers: [
        AttendanceService,
        {
          provide: AttendanceModelAction,
          useValue: mockAttendanceModelAction,
        },
        {
          provide: StudentDailyAttendanceModelAction,
          useValue: mockStudentDailyAttendanceModelAction,
        },
        {
          provide: AcademicSessionModelAction,
          useValue: mockAcademicSessionModelAction,
        },
        {
          provide: AcademicSessionService,
          useValue: mockAcademicSessionService,
        },
        {
          provide: TermModelAction,
          useValue: mockTermModelAction,
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
        {
          provide: AttendanceEditRequestModelAction,
          useValue: mockEditRequestModelAction,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: {
            child: jest.fn().mockReturnValue({
              info: jest.fn(),
              warn: jest.fn(),
              error: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<ScheduleBasedAttendanceController>(
      ScheduleBasedAttendanceController,
    );
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('StudentDailyAttendanceController - Edit Requests', () => {
  let controller: StudentDailyAttendanceController;
  let service: jest.Mocked<AttendanceService>;
  let module: TestingModule;

  const mockRequest = {
    user: {
      userId: 'user-123',
      role: 'TEACHER',
      email: 'teacher@test.com',
    },
  } as unknown as IRequestWithUser;

  beforeEach(async () => {
    const mockService = {
      markStudentDailyAttendance: jest.fn(),
      getClassDailyAttendance: jest.fn(),
      getClassTermAttendance: jest.fn(),
      getStudentMonthlyAttendance: jest.fn(),
      getStudentTermAttendanceSummary: jest.fn(),
      updateStudentDailyAttendance: jest.fn(),
      createEditRequest: jest.fn(),
      getMyEditRequests: jest.fn(),
      reviewEditRequest: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [StudentDailyAttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<StudentDailyAttendanceController>(
      StudentDailyAttendanceController,
    );
    service = module.get(AttendanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('createEditRequest', () => {
    const dto: CreateEditRequestDto = {
      attendance_id: 'attendance-456',
      attendance_type: AttendanceType.SCHEDULE_BASED,
      proposed_changes: { status: 'PRESENT' },
      reason: 'Student was present but marked absent',
    };

    it('should create an edit request successfully', async () => {
      const expectedResult = {
        message: sysMsg.EDIT_REQUEST_CREATED_SUCCESSFULLY,
        data: { request_id: 'request-789' },
      };

      service.createEditRequest.mockResolvedValue(expectedResult);

      const result = await controller.createEditRequest(mockRequest, dto);

      expect(service.createEditRequest).toHaveBeenCalledWith(
        mockRequest.user.userId,
        dto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should throw NotFoundException if attendance not found', async () => {
      service.createEditRequest.mockRejectedValue(
        new NotFoundException(sysMsg.ATTENDANCE_NOT_FOUND),
      );

      await expect(
        controller.createEditRequest(mockRequest, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if attendance is not locked', async () => {
      service.createEditRequest.mockRejectedValue(
        new BadRequestException(
          'Attendance record is not locked. You can edit it directly.',
        ),
      );

      await expect(
        controller.createEditRequest(mockRequest, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if duplicate pending request exists', async () => {
      service.createEditRequest.mockRejectedValue(
        new BadRequestException(
          'A pending edit request already exists for this attendance record',
        ),
      );

      await expect(
        controller.createEditRequest(mockRequest, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if teacher does not own the attendance record', async () => {
      service.createEditRequest.mockRejectedValue(
        new ForbiddenException(
          'You can only request edits for attendance records you created',
        ),
      );

      await expect(
        controller.createEditRequest(mockRequest, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMyEditRequests', () => {
    it('should retrieve all edit requests', async () => {
      const mockRequests: Partial<AttendanceEditRequest>[] = [
        { id: 'req-1', status: EditRequestStatus.PENDING },
        { id: 'req-2', status: EditRequestStatus.APPROVED },
      ];

      const expectedResult = {
        message: sysMsg.EDIT_REQUESTS_RETRIEVED_SUCCESSFULLY,
        data: mockRequests as AttendanceEditRequest[],
      };

      service.getMyEditRequests.mockResolvedValue(expectedResult);

      const result = await controller.getMyEditRequests(mockRequest);

      expect(service.getMyEditRequests).toHaveBeenCalledWith(
        mockRequest.user.userId,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should return empty array when no requests exist', async () => {
      const expectedResult = {
        message: sysMsg.EDIT_REQUESTS_RETRIEVED_SUCCESSFULLY,
        data: [],
      };

      service.getMyEditRequests.mockResolvedValue(expectedResult);

      const result = await controller.getMyEditRequests(mockRequest);

      expect(service.getMyEditRequests).toHaveBeenCalledWith(
        mockRequest.user.userId,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('reviewEditRequest', () => {
    const requestId = 'request-123';
    const adminRequest = {
      user: {
        userId: 'admin-456',
        role: 'ADMIN',
        email: 'admin@test.com',
      },
    } as unknown as IRequestWithUser;

    it('should approve edit request successfully', async () => {
      const dto: ReviewEditRequestDto = {
        status: EditRequestStatus.APPROVED,
      };
      const expectedResult = {
        message: 'Edit request approved and changes applied successfully',
        data: {
          request_id: requestId,
          status: EditRequestStatus.APPROVED as
            | EditRequestStatus.APPROVED
            | EditRequestStatus.REJECTED,
        },
      };

      service.reviewEditRequest.mockResolvedValue(expectedResult);

      const result = await controller.reviewEditRequest(
        requestId,
        adminRequest,
        dto,
      );

      expect(service.reviewEditRequest).toHaveBeenCalledWith(
        requestId,
        adminRequest.user.userId,
        dto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should reject edit request successfully with comment', async () => {
      const dto: ReviewEditRequestDto = {
        status: EditRequestStatus.REJECTED,
        admin_comment: 'Invalid reason provided',
      };
      const expectedResult = {
        message: 'Edit request rejected successfully',
        data: {
          request_id: requestId,
          status: EditRequestStatus.REJECTED as
            | EditRequestStatus.APPROVED
            | EditRequestStatus.REJECTED,
        },
      };

      service.reviewEditRequest.mockResolvedValue(expectedResult);

      const result = await controller.reviewEditRequest(
        requestId,
        adminRequest,
        dto,
      );

      expect(service.reviewEditRequest).toHaveBeenCalledWith(
        requestId,
        adminRequest.user.userId,
        dto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should throw NotFoundException if request not found', async () => {
      const dto: ReviewEditRequestDto = {
        status: EditRequestStatus.APPROVED,
      };

      service.reviewEditRequest.mockRejectedValue(
        new NotFoundException('Edit request not found'),
      );

      await expect(
        controller.reviewEditRequest(requestId, adminRequest, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if request already reviewed', async () => {
      const dto: ReviewEditRequestDto = {
        status: EditRequestStatus.APPROVED,
      };

      service.reviewEditRequest.mockRejectedValue(
        new BadRequestException(
          `Cannot review request with status: ${EditRequestStatus.APPROVED}`,
        ),
      );

      await expect(
        controller.reviewEditRequest(requestId, adminRequest, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if rejecting without comment', async () => {
      const dto: ReviewEditRequestDto = {
        status: EditRequestStatus.REJECTED,
      };

      service.reviewEditRequest.mockRejectedValue(
        new BadRequestException(
          'Admin comment is required when rejecting a request',
        ),
      );

      await expect(
        controller.reviewEditRequest(requestId, adminRequest, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if attendance was modified after request creation', async () => {
      const dto: ReviewEditRequestDto = {
        status: EditRequestStatus.APPROVED,
      };

      service.reviewEditRequest.mockRejectedValue(
        new BadRequestException(
          'The attendance record has been modified since this edit request was created. ' +
            'Please review the current attendance state and create a new request if needed.',
        ),
      );

      await expect(
        controller.reviewEditRequest(requestId, adminRequest, dto),
      ).rejects.toThrow(BadRequestException);
      expect(service.reviewEditRequest).toHaveBeenCalledWith(
        requestId,
        adminRequest.user.userId,
        dto,
      );
    });
  });
});
