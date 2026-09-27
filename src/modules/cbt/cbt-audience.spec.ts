import { ForbiddenException } from '@nestjs/common';

import { CbtService } from './cbt.service';
import { CbtExam, CbtExamStatus, CbtExamType } from './entities';

type AudienceChecks = {
  assertExamAvailable(exam: CbtExam, currentClassId: string | null): void;
  assertAttemptAudience(
    exam: CbtExam,
    owner: { studentId?: string; applicantId?: string },
  ): void;
};

describe('CBT audience boundaries', () => {
  const service = new CbtService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  ) as unknown as AudienceChecks;

  const exam = (examType: CbtExamType) =>
    ({
      examType,
      status: CbtExamStatus.ACTIVE,
      availableFrom: null,
      availableTo: null,
      classes: [{ id: 'class-id' }],
    }) as CbtExam;

  it('prevents a student from starting an entrance examination', () => {
    expect(() =>
      service.assertExamAvailable(exam(CbtExamType.ENTRANCE), 'class-id'),
    ).toThrow(ForbiddenException);
  });

  it('allows a student to access an internal examination for their class', () => {
    expect(() =>
      service.assertExamAvailable(exam(CbtExamType.IN_SCHOOL), 'class-id'),
    ).not.toThrow();
  });

  it('keeps student and applicant attempts in their respective exam types', () => {
    expect(() =>
      service.assertAttemptAudience(exam(CbtExamType.ENTRANCE), {
        studentId: 'student-id',
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertAttemptAudience(exam(CbtExamType.IN_SCHOOL), {
        applicantId: 'applicant-id',
      }),
    ).toThrow(ForbiddenException);
  });
});
