import { NotFoundException } from '@nestjs/common';
import { Logger } from 'winston';

import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { ClassStudentModelAction } from '../../class/model-actions/class-student.action';
import { StudentModelAction } from '../../student/model-actions/student-actions';
import { TimetableService } from '../../timetable/timetable.service';
import { UserService } from '../../user/user.service';

import { StudentDashboardService } from './student-dashboard.service';

describe('StudentDashboardService', () => {
  let service: StudentDashboardService;
  let userService: UserService;
  let studentModelAction: StudentModelAction;
  let timetableService: TimetableService;
  let academicSessionService: AcademicSessionService;
  let classStudentModelAction: ClassStudentModelAction;
  let logger: Logger;

  beforeEach(() => {
    userService = {
      findOne: jest.fn(),
    } as unknown as UserService;
    studentModelAction = {
      list: jest.fn(),
    } as unknown as StudentModelAction;
    timetableService = {
      findByClass: jest.fn(),
    } as unknown as TimetableService;
    academicSessionService = {
      activeSessions: jest.fn().mockResolvedValue({
        data: { id: 'active-session' },
      }),
    } as unknown as AcademicSessionService;
    classStudentModelAction = {
      list: jest.fn().mockResolvedValue({
        payload: [{ class: { id: 'class-1', name: 'Grade 10', arm: 'A' } }],
      }),
    } as unknown as ClassStudentModelAction;
    logger = {
      child: () => logger,
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    service = new StudentDashboardService(
      userService,
      studentModelAction,
      timetableService,
      academicSessionService,
      classStudentModelAction,
      logger,
    );
  });

  it('should load student dashboard successfully with all data', async () => {
    const mockStudent = {
      id: 'student-1',
      user: { id: 'user-1' },
      stream: { name: 'Legacy class' },
    };

    (studentModelAction.list as jest.Mock).mockResolvedValue({
      payload: [mockStudent],
    });

    const result = await service.loadStudentDashboard('user-1');

    expect(result).toHaveProperty('todays_timetable');
    expect(result).toHaveProperty('latest_results');
    expect(result).toHaveProperty('announcements');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata.class).toBe('Grade 10 A');
    expect(result.metadata.enrollment_status).toBe('Active');
  });

  it('should throw NotFoundException if student record not found', async () => {
    (studentModelAction.list as jest.Mock).mockResolvedValue({
      payload: [],
    });

    await expect(service.loadStudentDashboard('user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should provide fallback when services are unavailable', async () => {
    const mockStudent = {
      id: 'student-1',
      user: { id: 'user-1' },
      stream: { name: 'Legacy class' },
    };

    (studentModelAction.list as jest.Mock).mockResolvedValue({
      payload: [mockStudent],
    });
    (classStudentModelAction.list as jest.Mock).mockResolvedValue({
      payload: [],
    });

    const result = await service.loadStudentDashboard('user-1');

    expect(result.todays_timetable).toEqual([]);
    expect(result.latest_results).toEqual([]);
    expect(result.announcements).toEqual([]);
  });

  it('should handle missing stream gracefully', async () => {
    const mockStudent = {
      id: 'student-1',
      user: { id: 'user-1' },
      stream: null,
    };

    (studentModelAction.list as jest.Mock).mockResolvedValue({
      payload: [mockStudent],
    });
    (classStudentModelAction.list as jest.Mock).mockResolvedValue({
      payload: [],
    });

    const result = await service.loadStudentDashboard('user-1');

    expect(result.metadata.class).toBe('Not Assigned');
    expect(result.metadata.enrollment_status).toBe('Pending');
  });
});
