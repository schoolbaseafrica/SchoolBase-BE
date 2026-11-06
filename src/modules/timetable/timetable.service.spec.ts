import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { IRequestWithUser } from '../../common/types';
import { SessionStatus } from '../academic-session/entities/academic-session.entity';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassSubject } from '../class/entities/class-subject.entity';
import { ClassTeacher } from '../class/entities/class-teacher.entity';
import { ClassStudentModelAction } from '../class/model-actions/class-student.action';
import { ClassTeacherModelAction } from '../class/model-actions/class-teacher.action';
import { ClassModelAction } from '../class/model-actions/class.actions';
import { NotificationService } from '../notification/services/notification.service';
import { UserRole } from '../shared/enums';

import { AddScheduleDto } from './dto/timetable.dto';
import { Schedule } from './entities/schedule.entity';
import { Timetable } from './entities/timetable.entity';
import { DayOfWeek, PeriodType } from './enums/timetable.enums';
import { ScheduleModelAction } from './model-actions/schedule.model-action';
import { TimetableModelAction } from './model-actions/timetable.model-action';
import { TimetableValidationService } from './services/timetable-validation.service';
import { TimetableService } from './timetable.service';

describe('TimetableService', () => {
  let service: TimetableService;
  let timetableModelAction: jest.Mocked<TimetableModelAction>;
  let validationService: jest.Mocked<TimetableValidationService>;
  let scheduleModelAction: jest.Mocked<ScheduleModelAction>;
  let classModelAction: jest.Mocked<ClassModelAction>;
  let notificationService: jest.Mocked<NotificationService>;
  let classStudentModelAction: jest.Mocked<ClassStudentModelAction>;
  let classTeacherModelAction: jest.Mocked<ClassTeacherModelAction>;
  let classSubjects: { find: jest.Mock };

  const mockClassId = 'class-123';
  const mockTimetableId = 'timetable-123';
  const mockScheduleId = 'schedule-123';
  const adminActor = {
    id: 'admin-user',
    userId: 'admin-user',
    roles: [UserRole.ADMIN],
  } as IRequestWithUser['user'];
  const teacherActor = {
    id: 'teacher-user',
    userId: 'teacher-user',
    teacher_id: 'teacher-123',
    roles: [UserRole.TEACHER],
  } as IRequestWithUser['user'];

  beforeEach(async () => {
    timetableModelAction = {
      get: jest.fn(),
      create: jest.fn(),
      findTimetableByClassId: jest.fn(),
      findAllTimetables: jest.fn(), // ✅ NEW: mock for getAll
    } as unknown as jest.Mocked<TimetableModelAction>;

    validationService = {
      validateNewSchedule: jest.fn(),
      validateUpdateSchedule: jest.fn(),
    } as unknown as jest.Mocked<TimetableValidationService>;

    scheduleModelAction = {
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      getScheduleWithTimetable: jest.fn(),
    } as unknown as jest.Mocked<ScheduleModelAction>;

    classModelAction = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ClassModelAction>;

    notificationService = {
      createNotification: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    classStudentModelAction = {
      list: jest.fn(),
    } as unknown as jest.Mocked<ClassStudentModelAction>;

    classTeacherModelAction = {
      list: jest.fn(),
    } as unknown as jest.Mocked<ClassTeacherModelAction>;
    classSubjects = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimetableService,
        { provide: TimetableModelAction, useValue: timetableModelAction },
        { provide: TimetableValidationService, useValue: validationService },
        { provide: ScheduleModelAction, useValue: scheduleModelAction },
        { provide: ClassModelAction, useValue: classModelAction },
        { provide: NotificationService, useValue: notificationService },
        { provide: ClassStudentModelAction, useValue: classStudentModelAction },
        { provide: ClassTeacherModelAction, useValue: classTeacherModelAction },
        { provide: getRepositoryToken(ClassSubject), useValue: classSubjects },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TimetableService>(TimetableService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addSchedule', () => {
    const addScheduleDto: AddScheduleDto = {
      class_id: mockClassId,
      day: DayOfWeek.MONDAY,
      start_time: '09:00:00',
      end_time: '10:00:00',
      period_type: PeriodType.ACADEMICS,
      subject_id: 'subject-123',
      teacher_id: 'teacher-123',
    };

    it('should successfully add a schedule', async () => {
      timetableModelAction.get.mockResolvedValue({
        id: mockTimetableId,
      } as Timetable);
      scheduleModelAction.create.mockResolvedValue({
        id: mockScheduleId,
        ...addScheduleDto,
        timetable: { id: mockTimetableId },
      } as unknown as Schedule);

      classStudentModelAction.list.mockResolvedValue({
        payload: [
          {
            student: {
              user: { id: 'student-user-1' },
              parent: { user: { id: 'parent-user-1' } },
            },
          } as unknown as ClassStudent,
        ],
        paginationMeta: {},
      });
      classTeacherModelAction.list.mockResolvedValue({
        payload: [
          {
            teacher: { user: { id: 'teacher-user-1' } },
          } as unknown as ClassTeacher,
        ],
        paginationMeta: {},
      });
      notificationService.createNotification.mockResolvedValue(undefined);

      const result = await service.addSchedule(addScheduleDto, adminActor);

      expect(validationService.validateNewSchedule).toHaveBeenCalledWith(
        addScheduleDto,
      );
      expect(timetableModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { class_id: mockClassId },
      });
      expect(scheduleModelAction.create).toHaveBeenCalledWith({
        createPayload: {
          ...addScheduleDto,
          room: null,
          timetable: { id: mockTimetableId },
        },
        transactionOptions: { useTransaction: false },
      });
      expect(result).toBeDefined();
      expect(result.timetable).toBeUndefined(); // Should be deleted

      // Wait for async notification to complete
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(notificationService.createNotification).toHaveBeenCalled();
    });

    it('should throw NotFoundException if class does not exist', async () => {
      classModelAction.get.mockResolvedValue(null);
      validationService.validateNewSchedule.mockRejectedValue(
        new NotFoundException('Class not found'),
      );

      await expect(
        service.addSchedule(addScheduleDto, adminActor),
      ).rejects.toThrow(NotFoundException);

      // Ensure no notification attempted on failure
      expect(notificationService.createNotification).not.toHaveBeenCalled();
    });

    it('should create a new timetable if one does not exist', async () => {
      timetableModelAction.get.mockResolvedValue(null);
      timetableModelAction.create.mockResolvedValue({
        id: mockTimetableId,
      } as Timetable);
      scheduleModelAction.create.mockResolvedValue({
        id: mockScheduleId,
        ...addScheduleDto,
        timetable: { id: mockTimetableId },
      } as unknown as Schedule);

      classStudentModelAction.list.mockResolvedValue({
        payload: [
          {
            student: {
              user: { id: 'student-user-1' },
              parent: { user: { id: 'parent-user-1' } },
            },
          } as unknown as ClassStudent,
        ],
        paginationMeta: {},
      });
      classTeacherModelAction.list.mockResolvedValue({
        payload: [
          {
            teacher: { user: { id: 'teacher-user-1' } },
          } as unknown as ClassTeacher,
        ],
        paginationMeta: {},
      });
      notificationService.createNotification.mockResolvedValue(undefined);

      await service.addSchedule(addScheduleDto, adminActor);

      expect(timetableModelAction.create).toHaveBeenCalledWith({
        createPayload: {
          class_id: mockClassId,
          is_active: true,
        },
        transactionOptions: { useTransaction: false },
      });

      // Notification should be triggered for the created schedule too
      // Wait for async notification to complete
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(notificationService.createNotification).toHaveBeenCalled();
    });

    it('should throw BadRequestException if subject is missing for lesson', async () => {
      const invalidDto = { ...addScheduleDto, subject_id: undefined };

      await expect(
        service.addSchedule(
          invalidDto as unknown as AddScheduleDto,
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows an active class teacher to create a schedule for their assigned class', async () => {
      classModelAction.get.mockResolvedValue({
        is_deleted: false,
        academicSession: { id: 'session-123', status: SessionStatus.ACTIVE },
      } as never);
      classTeacherModelAction.list.mockResolvedValue({
        payload: [{ id: 'assignment-123' }],
        paginationMeta: {},
      } as never);
      timetableModelAction.get.mockResolvedValue({
        id: mockTimetableId,
      } as Timetable);
      scheduleModelAction.create.mockResolvedValue({
        id: mockScheduleId,
        timetable: { id: mockTimetableId },
      } as Schedule);

      await service.addSchedule({ ...addScheduleDto }, teacherActor);

      expect(classTeacherModelAction.list).toHaveBeenCalledWith({
        filterRecordOptions: {
          class: { id: mockClassId },
          teacher: { id: teacherActor.teacher_id },
          session_id: 'session-123',
          is_active: true,
        },
      });
      expect(scheduleModelAction.create).toHaveBeenCalled();
    });

    it('rejects a teacher without an active class assignment before writing', async () => {
      classModelAction.get.mockResolvedValue({
        is_deleted: false,
        academicSession: { id: 'session-123', status: SessionStatus.ACTIVE },
      } as never);
      classTeacherModelAction.list.mockResolvedValue({ payload: [] } as never);

      await expect(
        service.addSchedule({ ...addScheduleDto }, teacherActor),
      ).rejects.toThrow(ForbiddenException);
      expect(validationService.validateNewSchedule).not.toHaveBeenCalled();
      expect(scheduleModelAction.create).not.toHaveBeenCalled();
    });

    it('keeps past-session class timetables read-only for teachers', async () => {
      classModelAction.get.mockResolvedValue({
        is_deleted: false,
        academicSession: { id: 'session-123', status: SessionStatus.ARCHIVED },
      } as never);

      await expect(
        service.addSchedule({ ...addScheduleDto }, teacherActor),
      ).rejects.toThrow(ForbiddenException);
      expect(classTeacherModelAction.list).not.toHaveBeenCalled();
    });
  });

  describe('editSchedule access', () => {
    it('lets an assigned class teacher edit a lesson', async () => {
      scheduleModelAction.getScheduleWithTimetable.mockResolvedValue({
        timetable: { class_id: mockClassId },
      } as Schedule);
      classModelAction.get.mockResolvedValue({
        is_deleted: false,
        academicSession: { id: 'session-123', status: SessionStatus.ACTIVE },
      } as never);
      classTeacherModelAction.list.mockResolvedValue({
        payload: [{ id: 'assignment-123' }],
      } as never);
      scheduleModelAction.update.mockResolvedValue({
        id: mockScheduleId,
        start_time: '10:00:00',
      } as Schedule);
      scheduleModelAction.get.mockResolvedValue(null);

      await expect(
        service.editSchedule(
          mockScheduleId,
          { start_time: '10:00:00' },
          teacherActor,
        ),
      ).resolves.toMatchObject({ start_time: '10:00:00' });
      expect(validationService.validateUpdateSchedule).toHaveBeenCalledWith(
        mockScheduleId,
        { start_time: '10:00:00' },
      );
      expect(scheduleModelAction.update).toHaveBeenCalled();
    });

    it('rejects editing another class timetable before validation or update', async () => {
      scheduleModelAction.getScheduleWithTimetable.mockResolvedValue({
        timetable: { class_id: mockClassId },
      } as Schedule);
      classModelAction.get.mockResolvedValue({
        is_deleted: false,
        academicSession: { id: 'session-123', status: SessionStatus.ACTIVE },
      } as never);
      classTeacherModelAction.list.mockResolvedValue({ payload: [] } as never);

      await expect(
        service.editSchedule(mockScheduleId, {}, teacherActor),
      ).rejects.toThrow(ForbiddenException);
      expect(validationService.validateUpdateSchedule).not.toHaveBeenCalled();
      expect(scheduleModelAction.update).not.toHaveBeenCalled();
    });
  });

  describe('class schedule options', () => {
    it('returns only active subject and teacher pairs for an assigned class teacher', async () => {
      classModelAction.get.mockResolvedValue({
        is_deleted: false,
        academicSession: { id: 'session-123', status: SessionStatus.ACTIVE },
      } as never);
      classTeacherModelAction.list.mockResolvedValue({
        payload: [{ id: 'assignment-123' }],
      } as never);
      classSubjects.find.mockResolvedValue([
        {
          subject: { id: 'subject-1', name: 'Mathematics' },
          teacher: {
            id: 'teacher-123',
            is_active: true,
            user: { first_name: 'Ada', last_name: 'Okoro', is_active: true },
          },
        },
        { subject: { id: 'subject-2', name: 'English' }, teacher: null },
      ]);

      await expect(
        service.getClassScheduleOptions(mockClassId, teacherActor),
      ).resolves.toEqual([
        {
          subject: { id: 'subject-1', name: 'Mathematics' },
          teacher: { id: 'teacher-123', name: 'Ada Okoro' },
        },
      ]);
      expect(classSubjects.find).toHaveBeenCalledWith({
        where: { class: { id: mockClassId } },
        relations: { subject: true, teacher: { user: true } },
      });
    });
  });

  describe('findByClass', () => {
    it('should return timetable with schedules', async () => {
      const mockTimetable = {
        class_id: mockClassId,
        schedules: [],
      };
      timetableModelAction.findTimetableByClassId.mockResolvedValue({
        id: mockTimetableId,
        ...mockTimetable,
      } as Timetable);

      const result = await service.findByClass(mockClassId);

      expect(timetableModelAction.findTimetableByClassId).toHaveBeenCalledWith(
        mockClassId,
      );
      expect(result).toEqual(mockTimetable);
    });

    it('should return empty structure if timetable not found', async () => {
      timetableModelAction.findTimetableByClassId.mockResolvedValue(null);

      const result = await service.findByClass(mockClassId);

      expect(result).toEqual({
        class_id: mockClassId,
        schedules: [],
      });
    });
  });

  // ------------------- NEW TESTS FOR view time table START -------------------
  describe('getAll', () => {
    it('should return paginated timetables with schedules', async () => {
      const mockTimetables = [
        {
          class_id: mockClassId,
          class: { name: 'SS1' },
          schedules: [
            {
              id: mockScheduleId,
              day: DayOfWeek.MONDAY,
              start_time: '09:00:00',
              end_time: '10:00:00',
              period_type: PeriodType.ACADEMICS,
              room: 'Room 1',
              subject: { id: 'subject-123', name: 'Math' },
              teacher: {
                id: 'teacher-123',
                title: 'Mr',
                user: { first_name: 'John', last_name: 'Doe' },
              },
            },
          ],
        } as unknown as Timetable,
      ];

      timetableModelAction.findAllTimetables.mockResolvedValue(mockTimetables);

      const result = await service.getAll(1, 20);

      expect(timetableModelAction.findAllTimetables).toHaveBeenCalled();
      expect(result.data.length).toBe(1);
      expect(result.pagination.total).toBe(1);
      // expect(result.data[0].name).toBe('A');
      expect(result.data[0].schedules[0].teacher?.first_name).toBe('John');
    });

    it('should filter schedules by day if provided', async () => {
      const mockTimetables = [
        {
          class_id: mockClassId,
          class: { name: 'SS1', arm: 'B' },
          schedules: [
            { id: 's1', day: DayOfWeek.MONDAY },
            { id: 's2', day: DayOfWeek.TUESDAY },
          ],
        } as unknown as Timetable,
      ];

      timetableModelAction.findAllTimetables.mockResolvedValue(mockTimetables);

      const result = await service.getAll(1, 20, DayOfWeek.MONDAY);

      expect(result.data[0].schedules.length).toBe(1);
      expect(result.data[0].schedules[0].day).toBe(DayOfWeek.MONDAY);
    });

    it('should return empty data and pagination if no timetables found', async () => {
      timetableModelAction.findAllTimetables.mockResolvedValue([]);

      const result = await service.getAll(1, 20);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.total_pages).toBe(0);
    });
  });
  // ------------------- NEW TESTS FOR view time table END -------------------

  describe('unassignRoom', () => {
    it('should successfully unassign room from schedule', async () => {
      const mockSchedule = {
        id: mockScheduleId,
        day: DayOfWeek.MONDAY,
        start_time: '09:00:00',
        end_time: '10:00:00',
        period_type: PeriodType.ACADEMICS,
        room_id: 'room-123',
        timetable: { id: mockTimetableId },
      } as unknown as Schedule;

      const updatedSchedule = {
        ...mockSchedule,
        room_id: null,
      };

      scheduleModelAction.get.mockResolvedValue(mockSchedule);
      scheduleModelAction.update.mockResolvedValue(updatedSchedule);

      const result = await service.unassignRoom(mockScheduleId);

      expect(scheduleModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: mockScheduleId },
      });
      expect(scheduleModelAction.update).toHaveBeenCalledWith({
        updatePayload: { room_id: null },
        identifierOptions: { id: mockScheduleId },
        transactionOptions: { useTransaction: false },
      });
      expect(result.message).toBeDefined();
      expect(result.room_id).toBeNull();
      expect(result.timetable).toBeUndefined();
    });

    it('should throw BadRequestException if schedule does not exist', async () => {
      scheduleModelAction.get.mockResolvedValue(null);

      await expect(service.unassignRoom(mockScheduleId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle schedule without existing room assignment', async () => {
      const mockSchedule = {
        id: mockScheduleId,
        day: DayOfWeek.MONDAY,
        start_time: '09:00:00',
        end_time: '10:00:00',
        period_type: PeriodType.ACADEMICS,
        room_id: null,
        timetable: { id: mockTimetableId },
      } as unknown as Schedule;

      scheduleModelAction.get.mockResolvedValue(mockSchedule);
      scheduleModelAction.update.mockResolvedValue(mockSchedule);

      const result = await service.unassignRoom(mockScheduleId);

      expect(scheduleModelAction.update).toHaveBeenCalledWith({
        updatePayload: { room_id: null },
        identifierOptions: { id: mockScheduleId },
        transactionOptions: { useTransaction: false },
      });
      expect(result.room_id).toBeNull();
    });
  });
});
