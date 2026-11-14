import { ForbiddenException } from '@nestjs/common';

import { CbtService } from './cbt.service';

describe('teacher CBT result access', () => {
  it('rejects an exam without an assigned class or matching subject', async () => {
    const service = Object.create(CbtService.prototype) as CbtService;
    Reflect.set(service, 'dataSource', {
      query: jest.fn().mockResolvedValue([]),
    });
    Reflect.set(service, 'getExamAttempts', jest.fn());

    await expect(
      service.getTeacherExamAttempts('exam-1', 'user-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('passes only authorized class IDs into the report query', async () => {
    const service = Object.create(CbtService.prototype) as CbtService;
    Reflect.set(service, 'dataSource', {
      query: jest
        .fn()
        .mockResolvedValue([{ id: 'class-1' }, { id: 'class-2' }]),
    });
    const report = jest.fn().mockResolvedValue({ candidates: [] });
    Reflect.set(service, 'getExamAttempts', report);

    await service.getTeacherExamAttempts('exam-1', 'user-1');
    expect(report).toHaveBeenCalledWith('exam-1', ['class-1', 'class-2']);
  });
});
