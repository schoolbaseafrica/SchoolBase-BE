import { ForbiddenException } from '@nestjs/common';

import { CbtService } from './cbt.service';
import { CbtExamStatus, CbtExamType } from './entities';

describe('teacher CBT exam management', () => {
  const createService = () => {
    const service = Object.create(CbtService.prototype) as CbtService;
    const query = jest
      .fn()
      .mockResolvedValue([
        { classId: 'class-1', subjectId: 'maths-1', sessionId: 'session-1' },
      ]);
    Reflect.set(service, 'dataSource', { query });
    Reflect.set(
      service,
      'createExam',
      jest.fn().mockResolvedValue({ id: 'exam-1' }),
    );
    return { service, query };
  };

  it('rejects entrance exams and classes outside the teacher subject assignment', async () => {
    const { service } = createService();
    const dto = {
      name: 'Maths',
      timeLimitMinutes: 60,
      sessionId: 'session-1',
      subjectId: 'maths-1',
      classIds: ['class-1'],
    };
    await expect(
      service.createTeacherExam(
        { ...dto, examType: CbtExamType.ENTRANCE },
        'teacher-user',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createTeacherExam(
        { ...dto, classIds: ['other-class'] },
        'teacher-user',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates an internal exam only for an assigned class and subject', async () => {
    const { service } = createService();
    const dto = {
      name: 'Maths',
      timeLimitMinutes: 60,
      sessionId: 'session-1',
      subjectId: 'maths-1',
      classIds: ['class-1'],
    };
    await service.createTeacherExam(dto, 'teacher-user');
    expect(service.createExam).toHaveBeenCalledWith(
      { ...dto, examType: CbtExamType.IN_SCHOOL },
      'teacher-user',
    );
  });

  it('casts the exam UUID when checking text class-teacher session assignments', async () => {
    const { service, query } = createService();
    await service.listTeacherExams('teacher-user');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('assignment.session_id = exam.session_id::text'),
      ['teacher-user'],
    );

    Reflect.set(service, 'getExamAttempts', jest.fn().mockResolvedValue([]));
    await service.getTeacherExamAttempts('exam-1', 'teacher-user');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('assignment.session_id = exam.session_id::text'),
      ['exam-1', 'teacher-user'],
    );
  });

  it('blocks management of exams owned by another teacher', async () => {
    const { service } = createService();
    Reflect.set(service, 'examRepository', {
      findOne: jest.fn().mockResolvedValue(null),
    });
    Reflect.set(service, 'getExamForManagement', jest.fn());
    await expect(
      service.getTeacherExamForManagement('exam-1', 'teacher-user'),
    ).rejects.toThrow(ForbiddenException);
    expect(service.getExamForManagement).not.toHaveBeenCalled();
  });

  it('blocks edits to a question in another teacher exam', async () => {
    const { service } = createService();
    Reflect.set(service, 'questionRepository', {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'question-1', examId: 'exam-2' }),
    });
    Reflect.set(service, 'examRepository', {
      findOne: jest.fn().mockResolvedValue(null),
    });
    Reflect.set(service, 'updateQuestion', jest.fn());
    await expect(
      service.updateTeacherQuestion(
        'question-1',
        { body: 'Changed' },
        'teacher-user',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.updateQuestion).not.toHaveBeenCalled();
  });

  it('lets the owner submit only their assigned internal exam for review', async () => {
    const { service } = createService();
    Reflect.set(service, 'examRepository', {
      findOne: jest.fn().mockResolvedValue({
        id: 'exam-1',
        sessionId: 'session-1',
        subjectId: 'maths-1',
        classes: [{ id: 'class-1' }],
      }),
    });
    Reflect.set(
      service,
      'transitionExam',
      jest.fn().mockResolvedValue({
        status: CbtExamStatus.REVIEW,
      }),
    );
    await service.submitTeacherExamForReview('exam-1', 'teacher-user');
    expect(service.transitionExam).toHaveBeenCalledWith('exam-1', {
      status: CbtExamStatus.REVIEW,
    });
  });
});
