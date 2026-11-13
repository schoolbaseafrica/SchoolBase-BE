import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { TimetableModelAction } from '../../timetable/model-actions/timetable.model-action';

import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let timetableModelAction: TimetableModelAction;
  let logger: Logger;
  let academicSessionService: AcademicSessionService;
  let dataSource: DataSource;

  beforeEach(() => {
    timetableModelAction = {
      list: jest.fn(),
    } as unknown as TimetableModelAction;
    logger = {
      child: () => logger,
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;
    academicSessionService = {
      activeSessions: jest
        .fn()
        .mockResolvedValue({ data: { id: 'session-1' } }),
    } as unknown as AcademicSessionService;
    dataSource = { query: jest.fn() } as unknown as DataSource;

    service = new AdminDashboardService(
      timetableModelAction,
      academicSessionService,
      logger,
      dataSource,
      { get: () => 'Africa/Lagos' } as unknown as ConfigService,
    );
  });

  it('reports distinct daily student and teacher marks for the selected session', async () => {
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce([{ marked: '12', eligible: '20' }])
      .mockResolvedValueOnce([{ marked: '4', eligible: '6' }]);
    const result = await service.loadTodayAttendance(
      '6141e83e-a4f1-4896-b184-eaf6e0e8d78d',
    );
    expect(result.students).toEqual({ marked: 12, eligible: 20 });
    expect(result.teachers).toEqual({ marked: 4, eligible: 6 });
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });

  it('should load today activities with all data', async () => {
    const mockTimetables = [
      {
        id: 'timetable-1',
        class: { id: 'class-1', name: 'Form 1A' },
        schedules: [
          {
            id: 'schedule-1',
            day: new Date()
              .toLocaleDateString('en-US', { weekday: 'long' })
              .toUpperCase(),
            start_time: '08:00:00',
            end_time: '09:00:00',
            period_type: 'ACADEMICS',
            room: 'Room 101',
            teacher: {
              id: 'teacher-1',
              title: 'Mr.',
              user: { first_name: 'John', last_name: 'Doe' },
            },
            subject: { id: 'subject-1', name: 'Mathematics' },
          },
        ],
      },
    ];

    (timetableModelAction.list as jest.Mock).mockResolvedValue({
      payload: mockTimetables,
    });

    const result = await service.loadTodayActivities();

    expect(result).toHaveProperty('todays_activities');
    expect(result).toHaveProperty('summary');
    expect(result.todays_activities.length).toBe(1);
    expect(result.todays_activities[0].class.name).toBe('Form 1A');
    expect(result.todays_activities[0].subject?.name).toBe('Mathematics');
    expect(result.summary.total_activities).toBe(1);
  });

  it('should return empty array when no activities exist', async () => {
    (timetableModelAction.list as jest.Mock).mockResolvedValue({
      payload: [],
    });

    const result = await service.loadTodayActivities();

    expect(result.todays_activities).toEqual([]);
    expect(result.summary.total_activities).toBe(0);
  });

  it('should identify activities with no teacher', async () => {
    const mockTimetables = [
      {
        id: 'timetable-1',
        class: { id: 'class-1', name: 'Form 1A' },
        schedules: [
          {
            id: 'schedule-1',
            day: new Date()
              .toLocaleDateString('en-US', { weekday: 'long' })
              .toUpperCase(),
            start_time: '08:00:00',
            end_time: '09:00:00',
            period_type: 'ACADEMICS',
            room: 'Room 101',
            teacher: null,
            subject: { id: 'subject-1', name: 'Mathematics' },
          },
        ],
      },
    ];

    (timetableModelAction.list as jest.Mock).mockResolvedValue({
      payload: mockTimetables,
    });

    const result = await service.loadTodayActivities();

    expect(result.summary.activities_with_no_teacher).toBe(1);
  });

  it('should sort activities by start time', async () => {
    const mockTimetables = [
      {
        id: 'timetable-1',
        class: { id: 'class-1', name: 'Form 1A' },
        schedules: [
          {
            id: 'schedule-2',
            day: new Date()
              .toLocaleDateString('en-US', { weekday: 'long' })
              .toUpperCase(),
            start_time: '10:00:00',
            end_time: '11:00:00',
            period_type: 'ACADEMICS',
            room: null,
            teacher: null,
            subject: { id: 'subject-2', name: 'Science' },
          },
          {
            id: 'schedule-1',
            day: new Date()
              .toLocaleDateString('en-US', { weekday: 'long' })
              .toUpperCase(),
            start_time: '08:00:00',
            end_time: '09:00:00',
            period_type: 'ACADEMICS',
            room: null,
            teacher: null,
            subject: { id: 'subject-1', name: 'Math' },
          },
        ],
      },
    ];

    (timetableModelAction.list as jest.Mock).mockResolvedValue({
      payload: mockTimetables,
    });

    const result = await service.loadTodayActivities();

    expect(result.todays_activities[0].start_time).toBe('08:00:00');
    expect(result.todays_activities[1].start_time).toBe('10:00:00');
  });
});
