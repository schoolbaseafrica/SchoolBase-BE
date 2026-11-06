import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import { SubjectModelAction } from '../../subject/model-actions/subject.actions';
import { SubjectService } from '../../subject/services/subject.service';
import { TeacherModelAction } from '../../teacher/model-actions/teacher-actions';
import { ClassModelAction, ClassSubjectModelAction } from '../model-actions';

import { ClassSubjectService } from './class-subject.service';

describe('ClassSubjectService assignment consistency', () => {
  const classSubjectAction = {
    get: jest.fn(),
    update: jest.fn(),
  };
  const teacherModelAction = { get: jest.fn() };
  const scheduledLessons = { find: jest.fn() };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue(scheduledLessons),
  };
  const subjectService = {
    notifyAffectedUsers: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { child: jest.fn().mockReturnValue({ error: jest.fn() }) };
  let service: ClassSubjectService;

  beforeEach(() => {
    jest.clearAllMocks();
    classSubjectAction.get.mockResolvedValue({
      id: 'class-subject-1',
      class: { id: 'class-1' },
      subject: { id: 'subject-1', name: 'Mathematics' },
      teacher: null,
    });
    teacherModelAction.get.mockResolvedValue({ id: 'teacher-1' });
    scheduledLessons.find.mockResolvedValue([]);
    service = new ClassSubjectService(
      classSubjectAction as unknown as ClassSubjectModelAction,
      {} as ClassModelAction,
      teacherModelAction as unknown as TeacherModelAction,
      {} as SubjectModelAction,
      subjectService as unknown as SubjectService,
      dataSource as unknown as DataSource,
      logger as unknown as Logger,
    );
  });

  it('rejects an assignment that conflicts with the timetable', async () => {
    scheduledLessons.find.mockResolvedValue([{ teacher_id: 'teacher-2' }]);

    await expect(
      service.assignTeacher('class-subject-1', 'teacher-1'),
    ).rejects.toThrow(ConflictException);
    expect(classSubjectAction.update).not.toHaveBeenCalled();
  });

  it('allows the scheduled teacher to be assigned', async () => {
    scheduledLessons.find.mockResolvedValue([{ teacher_id: 'teacher-1' }]);
    classSubjectAction.update.mockResolvedValue({});

    await expect(
      service.assignTeacher('class-subject-1', 'teacher-1'),
    ).resolves.toBeDefined();
    expect(classSubjectAction.update).toHaveBeenCalled();
  });
});
