import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';

import { ResultService } from 'src/modules/result/services';

import { ClassStudent } from '../../class/entities/class-student.entity';
import { StudentModelAction } from '../../student/model-actions';
import { CreateGradeSubmissionDto } from '../dto';
import { Grade, GradeSubmission, GradeSubmissionStatus } from '../entities';
import { GradeModelAction, GradeSubmissionModelAction } from '../model-actions';

import { GradeSubmissionService } from './grade-submission.service';

describe('GradeService', () => {
  let service: GradeSubmissionService;
  let gradeSubmissionModelAction: jest.Mocked<GradeSubmissionModelAction>;
  let gradeModelAction: jest.Mocked<GradeModelAction>;

  const mockLogger = {
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockTeacherId = 'teacher-uuid-123';
  const mockClassId = 'class-uuid-123';
  const mockSubjectId = 'subject-uuid-123';
  const mockTermId = 'term-uuid-123';
  const mockSessionId = 'session-uuid-123';
  const mockSubmissionId = 'submission-uuid-123';
  const mockGradeId = 'grade-uuid-123';

  const mockClassSubjectRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeSubmissionService,
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
        {
          provide: GradeSubmissionModelAction,
          useValue: {
            get: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            list: jest.fn(),
          },
        },
        {
          provide: GradeModelAction,
          useValue: {
            get: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: StudentModelAction,
          useValue: {
            repository: {
              createQueryBuilder: jest.fn(),
            },
          },
        },
        {
          provide: ResultService,
          useValue: {
            generateClassResults: jest.fn().mockResolvedValue({
              message: 'Results generated',
              generated_count: 0,
              result_ids: [],
            }),
          },
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn().mockReturnValue(mockClassSubjectRepo),
            transaction: jest.fn((callback) => {
              const mockManager = {
                getRepository: jest.fn((entity) => {
                  if (entity.name === 'GradeSubmission') {
                    return {
                      findOne: jest.fn().mockResolvedValue({
                        id: mockSubmissionId,
                        teacher_id: mockTeacherId,
                        class_id: mockClassId,
                        subject_id: mockSubjectId,
                        term_id: mockTermId,
                        academic_session_id: mockSessionId,
                        status: GradeSubmissionStatus.DRAFT,
                        teacher: {
                          id: mockTeacherId,
                          user: { first_name: 'Teacher', last_name: 'Name' },
                          title: 'Mr',
                        },
                        class: { id: mockClassId, name: 'SS1', arm: 'A' },
                        subject: { id: mockSubjectId, name: 'Mathematics' },
                        term: { id: mockTermId, name: 'FIRST' },
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      }),
                    };
                  }
                  if (entity.name === 'Grade') {
                    return {
                      find: jest.fn().mockResolvedValue([
                        {
                          id: mockGradeId,
                          submission_id: mockSubmissionId,
                          student_id: 'student-1',
                          ca_score: 25,
                          exam_score: 60,
                          total_score: 85,
                          grade_letter: 'A',
                          student: {
                            id: 'student-1',
                            user: { first_name: 'John', last_name: 'Doe' },
                            registration_number: 'STU-001',
                          },
                        },
                        {
                          id: 'grade-2',
                          submission_id: mockSubmissionId,
                          student_id: 'student-2',
                          ca_score: 20,
                          exam_score: 55,
                          total_score: 75,
                          grade_letter: 'B',
                          student: {
                            id: 'student-2',
                            user: { first_name: 'Jane', last_name: 'Smith' },
                            registration_number: 'STU-002',
                          },
                        },
                      ]),
                    };
                  }
                  return mockClassSubjectRepo;
                }),
              };
              return callback(mockManager);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GradeSubmissionService>(GradeSubmissionService);
    gradeSubmissionModelAction = module.get(GradeSubmissionModelAction);
    gradeModelAction = module.get(GradeModelAction);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateDraft', () => {
    const makeService = (status: GradeSubmissionStatus) => {
      const submission = {
        id: mockSubmissionId,
        teacher_id: mockTeacherId,
        class_id: mockClassId,
        subject_id: mockSubjectId,
        status,
      };
      const savedGrades = [
        {
          id: 'grade-1',
          student_id: 'student-1',
          ca_score: 20,
          exam_score: 50,
          student: { id: 'student-1' },
        },
      ];
      const gradeRepo = {
        find: jest.fn().mockImplementation(async () => [...savedGrades]),
        create: jest.fn((value) => value),
        save: jest.fn((value) => {
          const index = savedGrades.findIndex(
            (grade) => grade.student_id === value.student_id,
          );
          if (index >= 0) savedGrades[index] = value;
          else savedGrades.push(value);
          return Promise.resolve(value);
        }),
      };
      const submissionRepo = {
        findOne: jest.fn().mockResolvedValue(submission),
      };
      const studentRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
      };
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === GradeSubmission) return submissionRepo;
          if (entity === Grade) return gradeRepo;
          if (entity === ClassStudent) return studentRepo;
          throw new Error('Unexpected repository');
        }),
      };
      const dataSource = {
        transaction: jest.fn((callback) => callback(manager)),
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
        }),
      };
      const instance = new GradeSubmissionService(
        mockLogger as never,
        {} as never,
        {} as never,
        {} as never,
        dataSource as never,
        {} as never,
      );
      return { instance, gradeRepo, studentRepo, savedGrades };
    };

    it('adds another student to a draft without deleting an existing grade', async () => {
      const { instance, gradeRepo, savedGrades } = makeService(
        GradeSubmissionStatus.DRAFT,
      );
      await instance.updateDraft(mockTeacherId, mockSubmissionId, {
        grades: [{ student_id: 'student-2', ca_score: 0, exam_score: 60 }],
      });
      expect(savedGrades).toHaveLength(2);
      expect(savedGrades[0].student_id).toBe('student-1');
      expect(gradeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: 'student-2',
          total_score: 60,
          grade_letter: 'C',
        }),
      );
    });

    it('rejects changes after a draft is submitted', async () => {
      const { instance, gradeRepo } = makeService(
        GradeSubmissionStatus.SUBMITTED,
      );
      await expect(
        instance.updateDraft(mockTeacherId, mockSubmissionId, {
          grades: [{ student_id: 'student-2', ca_score: 20 }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(gradeRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a different teacher before changing grades', async () => {
      const { instance, gradeRepo } = makeService(GradeSubmissionStatus.DRAFT);
      await expect(
        instance.updateDraft('other-teacher', mockSubmissionId, {
          grades: [{ student_id: 'student-2', ca_score: 20 }],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(gradeRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a student outside the class roster', async () => {
      const { instance, gradeRepo, studentRepo } = makeService(
        GradeSubmissionStatus.DRAFT,
      );
      studentRepo.findOne.mockResolvedValue(null);
      await expect(
        instance.updateDraft(mockTeacherId, mockSubmissionId, {
          grades: [{ student_id: 'student-3', ca_score: 20 }],
        }),
      ).rejects.toThrow('Student is not enrolled in this class');
      expect(gradeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('createSubmission', () => {
    const createDto: CreateGradeSubmissionDto = {
      class_id: mockClassId,
      subject_id: mockSubjectId,
      term_id: mockTermId,
      academic_session_id: mockSessionId,
      grades: [
        { student_id: 'student-1', ca_score: 25, exam_score: 60 },
        { student_id: 'student-2', ca_score: 20, exam_score: 55 },
      ],
    };

    it('should create a grade submission successfully', async () => {
      mockClassSubjectRepo.findOne.mockResolvedValue({ id: 'assignment-1' });
      gradeSubmissionModelAction.get.mockResolvedValue(null);
      (gradeSubmissionModelAction.create as jest.Mock).mockResolvedValue({
        id: mockSubmissionId,
        teacher_id: mockTeacherId,
        class_id: mockClassId,
        subject_id: mockSubjectId,
        term_id: mockTermId,
        academic_session_id: mockSessionId,
        status: GradeSubmissionStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (gradeModelAction.create as jest.Mock).mockResolvedValue({
        id: mockGradeId,
        submission_id: mockSubmissionId,
        student_id: 'student-1',
        ca_score: 25,
        exam_score: 60,
        total_score: 85,
        grade_letter: 'A',
      });

      const result = await service.createSubmission(mockTeacherId, createDto);

      expect(result).toBeDefined();
      expect(result.status).toBe(GradeSubmissionStatus.DRAFT);
      expect(gradeSubmissionModelAction.create).toHaveBeenCalled();
      expect(gradeModelAction.create).toHaveBeenCalledTimes(2);
    });

    it('should throw ForbiddenException if teacher not assigned to subject', async () => {
      mockClassSubjectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createSubmission(mockTeacherId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if submission already exists', async () => {
      mockClassSubjectRepo.findOne.mockResolvedValue({ id: 'assignment-1' });
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue({
        id: 'existing-submission',
      });

      await expect(
        service.createSubmission(mockTeacherId, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitForApproval', () => {
    beforeEach(() => {
      mockClassSubjectRepo.findOne.mockResolvedValue({ id: 'assignment-1' });
    });
    const mockSubmission = {
      id: mockSubmissionId,
      teacher_id: mockTeacherId,
      class_id: mockClassId,
      subject_id: mockSubjectId,
      term_id: mockTermId,
      academic_session_id: mockSessionId,
      status: GradeSubmissionStatus.DRAFT,
      submitted_at: null,
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      grades: [
        {
          id: 'grade-1',
          ca_score: 25,
          exam_score: 60,
          total_score: 85,
          grade_letter: 'A',
          comment: null,
          student: {
            id: 'student-1',
            user: { first_name: 'John', last_name: 'Doe' },
            registration_number: 'STU-001',
          },
        },
      ],
      teacher: {
        id: mockTeacherId,
        user: { first_name: 'Teacher', last_name: 'Name' },
        title: 'Mr',
      },
      class: { id: mockClassId, name: 'SS1', arm: 'A' },
      subject: { id: mockSubjectId, name: 'Mathematics' },
      term: { id: mockTermId, name: 'FIRST' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should submit grades for approval successfully', async () => {
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue(
        mockSubmission,
      );
      (gradeSubmissionModelAction.update as jest.Mock).mockResolvedValue({
        ...mockSubmission,
        status: GradeSubmissionStatus.SUBMITTED,
        submitted_at: new Date(),
      });

      const result = await service.submitForApproval(
        mockTeacherId,
        mockSubmissionId,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(GradeSubmissionStatus.SUBMITTED);
    });

    it('should throw NotFoundException if submission not found', async () => {
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue(null);

      await expect(
        service.submitForApproval(mockTeacherId, mockSubmissionId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if grades are incomplete', async () => {
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue({
        ...mockSubmission,
        grades: [
          {
            id: 'grade-1',
            ca_score: null,
            exam_score: 60,
            student: {
              id: 'student-1',
              user: { first_name: 'John', last_name: 'Doe' },
              registration_number: 'STU-001',
            },
          },
        ],
      });

      await expect(
        service.submitForApproval(mockTeacherId, mockSubmissionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects resubmission after the subject is transferred to another teacher', async () => {
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue(
        mockSubmission,
      );
      mockClassSubjectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.submitForApproval(mockTeacherId, mockSubmissionId),
      ).rejects.toThrow(ForbiddenException);
      expect(gradeSubmissionModelAction.update).not.toHaveBeenCalled();
    });
  });

  describe('getSubmission', () => {
    const mockSubmission = {
      id: mockSubmissionId,
      teacher_id: mockTeacherId,
      class_id: mockClassId,
      subject_id: mockSubjectId,
      term_id: mockTermId,
      academic_session_id: mockSessionId,
      status: GradeSubmissionStatus.DRAFT,
      submitted_at: null,
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      grades: [],
      teacher: {
        id: mockTeacherId,
        user: { first_name: 'Teacher', last_name: 'Name' },
        title: 'Mr',
      },
      class: { id: mockClassId, name: 'SS1', arm: 'A' },
      subject: { id: mockSubjectId, name: 'Mathematics' },
      term: { id: mockTermId, name: 'FIRST' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return submission details', async () => {
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue(
        mockSubmission,
      );

      const result = await service.getSubmission(
        mockSubmissionId,
        mockTeacherId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(mockSubmissionId);
    });

    it('should throw NotFoundException if submission not found', async () => {
      (gradeSubmissionModelAction.get as jest.Mock).mockResolvedValue(null);

      await expect(service.getSubmission(mockSubmissionId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('calculateGradeLetter', () => {
    it('should calculate correct grade letters', () => {
      // Access private method for testing
      const calculateGrade = (
        service as unknown as {
          calculateGradeLetter: (score: number) => string;
        }
      ).calculateGradeLetter.bind(service);

      expect(calculateGrade(95)).toBe('A');
      expect(calculateGrade(80)).toBe('A');
      expect(calculateGrade(75)).toBe('B');
      expect(calculateGrade(70)).toBe('B');
      expect(calculateGrade(65)).toBe('C');
      expect(calculateGrade(55)).toBe('D');
      expect(calculateGrade(45)).toBe('E');
      expect(calculateGrade(30)).toBe('F');
      expect(calculateGrade(0)).toBe('F');
    });
  });
});
