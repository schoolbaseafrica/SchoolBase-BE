import {
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import * as sysMsg from '../../../constants/system.messages';
import { UserRole } from '../../shared/enums';
import { StudentProfileResponseDto } from '../dto';
import { StudentService } from '../services';

import { StudentController } from './student.controller';

describe('StudentController', () => {
  let controller: StudentController;
  let studentService: jest.Mocked<StudentService>;

  const mockStudentService = {
    getMyProfile: jest.fn(),
  };

  const studentId = 'student-uuid-123';
  const mockStudentUser = {
    id: 'user-uuid-123',
    email: 'student@example.com',
    roles: [UserRole.STUDENT],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentController],
      providers: [
        {
          provide: StudentService,
          useValue: mockStudentService,
        },
      ],
    }).compile();

    controller = module.get<StudentController>(StudentController);
    studentService = module.get(StudentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyProfile', () => {
    it('should return student profile for an authenticated student', async () => {
      const mockProfile = {} as StudentProfileResponseDto;
      studentService.getMyProfile.mockResolvedValue(mockProfile);

      const result = await controller.getMyProfile(studentId, mockStudentUser);

      expect(studentService.getMyProfile).toHaveBeenCalledWith(
        studentId,
        mockStudentUser,
      );
      expect(result.status_code).toBe(HttpStatus.OK);
      expect(result.message).toBe(sysMsg.PROFILE_RETRIEVED);
      expect(result.data).toBe(mockProfile);
    });

    it('should return student profile for an admin', async () => {
      const mockAdminUser = {
        id: 'admin-uuid-456',
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
      };
      const mockProfile = {} as StudentProfileResponseDto;
      studentService.getMyProfile.mockResolvedValue(mockProfile);

      const result = await controller.getMyProfile(studentId, mockAdminUser);

      expect(studentService.getMyProfile).toHaveBeenCalledWith(
        studentId,
        mockAdminUser,
      );
      expect(result.status_code).toBe(HttpStatus.OK);
      expect(result.data).toBe(mockProfile);
    });

    it('should propagate ForbiddenException from the service', async () => {
      const errorMessage = 'You are not allowed to access this profile.';
      studentService.getMyProfile.mockRejectedValue(
        new ForbiddenException(errorMessage),
      );

      await expect(
        controller.getMyProfile(studentId, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.getMyProfile(studentId, mockStudentUser),
      ).rejects.toThrow(errorMessage);

      expect(studentService.getMyProfile).toHaveBeenCalledWith(
        studentId,
        mockStudentUser,
      );
    });

    it('should propagate NotFoundException from the service', async () => {
      studentService.getMyProfile.mockRejectedValue(
        new NotFoundException(sysMsg.STUDENT_NOT_FOUND),
      );

      await expect(
        controller.getMyProfile(studentId, mockStudentUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getMyProfile(studentId, mockStudentUser),
      ).rejects.toThrow(sysMsg.STUDENT_NOT_FOUND);

      expect(studentService.getMyProfile).toHaveBeenCalledWith(
        studentId,
        mockStudentUser,
      );
    });
  });
});
