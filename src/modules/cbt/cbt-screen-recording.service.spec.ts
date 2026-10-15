import { BadRequestException } from '@nestjs/common';

import { CbtScreenRecordingService } from './cbt-screen-recording.service';

describe('CbtScreenRecordingService', () => {
  const attemptId = 'attempt-1';
  const dto = {
    recordingId: '964715e1-5c8a-4f40-a756-62258655d54e',
    partNumber: 0,
    durationMs: 30_000,
  };
  const webm = Buffer.alloc(200);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(webm);
  const file = {
    buffer: webm,
    size: webm.length,
    mimetype: 'video/webm',
  };

  const setup = () => {
    const attempts = {
      findOne: jest.fn().mockResolvedValue({
        id: attemptId,
        startedAt: new Date(),
        submittedAt: null,
        exam: { proctoringMode: 'recorded', timeLimitMinutes: 60 },
      }),
      exists: jest.fn().mockResolvedValue(true),
    };
    const clips = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'clip-1', ...value })),
    };
    const cbt = {
      getAttempt: jest.fn().mockResolvedValue({ id: attemptId }),
      getPublicAttempt: jest.fn().mockResolvedValue({ id: attemptId }),
    };
    const minio = {
      uploadFile: jest
        .fn()
        .mockResolvedValue({ publicId: 'private/clip.webm' }),
      deleteImage: jest.fn(),
      streamFile: jest.fn(),
    };
    const service = new CbtScreenRecordingService(
      attempts as never,
      clips as never,
      cbt as never,
      minio as never,
    );
    return { service, attempts, clips, cbt, minio };
  };

  it('stores a valid student clip under its attempt', async () => {
    const { service, clips, minio } = setup();
    await expect(
      service.uploadForStudent(attemptId, 'student-1', file as never, dto),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'clip-1', partNumber: 0 }),
    );
    expect(minio.uploadFile).toHaveBeenCalledWith(
      file,
      `cbt-screen-recordings/${attemptId}/${dto.recordingId}`,
    );
    expect(clips.save).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId, objectKey: 'private/clip.webm' }),
    );
  });

  it('requires a valid applicant token before accepting the file', async () => {
    const { service, cbt, minio } = setup();
    cbt.getPublicAttempt.mockRejectedValue(
      new BadRequestException('Invalid token'),
    );
    await expect(
      service.uploadForApplicant(attemptId, 'invalid', file as never, dto),
    ).rejects.toThrow('Invalid token');
    expect(minio.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects non-video bytes and disabled recording modes', async () => {
    const { service, attempts, minio } = setup();
    await expect(
      service.uploadForStudent(
        attemptId,
        'student-1',
        {
          ...file,
          buffer: Buffer.alloc(200),
        } as never,
        dto,
      ),
    ).rejects.toThrow('valid WebM or MP4');
    attempts.findOne.mockResolvedValue({
      id: attemptId,
      startedAt: new Date(),
      submittedAt: null,
      exam: { proctoringMode: 'human', timeLimitMinutes: 60 },
    });
    await expect(
      service.uploadForStudent(attemptId, 'student-1', file as never, dto),
    ).rejects.toThrow('not enabled');
    expect(minio.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects clips after the attempt upload window closes', async () => {
    const { service, attempts, minio } = setup();
    attempts.findOne.mockResolvedValue({
      id: attemptId,
      startedAt: new Date(Date.now() - 60 * 60_000),
      submittedAt: new Date(Date.now() - 3 * 60_000),
      exam: { proctoringMode: 'recorded', timeLimitMinutes: 60 },
    });
    await expect(
      service.uploadForStudent(attemptId, 'student-1', file as never, dto),
    ).rejects.toThrow('upload window has closed');
    expect(minio.uploadFile).not.toHaveBeenCalled();
  });
});
