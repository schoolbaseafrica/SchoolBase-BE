import { createHash } from 'crypto';

import { GoneException } from '@nestjs/common';
import * as sharp from 'sharp';
import { DataSource } from 'typeorm';

import { MinioService } from '../../upload/services/minio.service';

import { StudentPhotoCaptureService } from './student-photo-capture.service';

describe('StudentPhotoCaptureService', () => {
  const token = 'A'.repeat(43);
  const tokenHash = createHash('sha256').update(token).digest('hex');

  it('rejects expired and previously used links before accepting a photo', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const minio = { uploadImage: jest.fn() } as unknown as MinioService;
    const service = new StudentPhotoCaptureService(dataSource, minio);

    await expect(service.validateToken(token)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect((dataSource.query as jest.Mock).mock.calls[0][1]).toEqual([
      tokenHash,
    ]);
    await expect(
      service.capture(token, { buffer: Buffer.from('photo') } as never),
    ).rejects.toBeInstanceOf(GoneException);
    expect(minio.uploadImage).not.toHaveBeenCalled();
  });

  it('saves one camera photo and refuses a replay of the link', async () => {
    const student = {
      id: 'student-1',
      photo_url: null,
      face_photo_object_key: 'schoolbase-users/student-1/old.jpg',
      face_photo_approved_at: new Date(),
      face_photo_approved_by: 'admin-1',
    };
    let state = 'pending';
    const managerMock = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return [
            {
              id: 'link-1',
              student_id: student.id,
              state,
              expires_at: new Date(Date.now() + 60_000),
            },
          ];
        }
        if (sql.includes('SET "state" = \'complete\'')) state = 'complete';
        return [];
      }),
      findOne: jest.fn().mockResolvedValue(student),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ id: 'link-1' }]),
      transaction: jest.fn(
        async (work: (manager: typeof managerMock) => unknown) =>
          work(managerMock),
      ),
    } as unknown as DataSource;
    const minio = {
      uploadImage: jest.fn().mockResolvedValue({
        url: 'https://images.example/student.jpg',
        publicId: 'student.jpg',
      }),
      deleteImage: jest.fn(),
    } as unknown as MinioService;
    const service = new StudentPhotoCaptureService(dataSource, minio);
    const buffer = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: 'white',
      },
    })
      .jpeg()
      .toBuffer();
    const file = { buffer } as never;

    await expect(service.capture(token, file)).resolves.toEqual({
      state: 'complete',
      photoUrl: 'https://images.example/student.jpg',
    });
    expect(student.photo_url).toBe('https://images.example/student.jpg');
    expect(student.face_photo_object_key).toBe('student.jpg');
    expect(student.face_photo_approved_at).toBeNull();
    expect(student.face_photo_approved_by).toBeNull();
    await expect(service.capture(token, file)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(minio.uploadImage).toHaveBeenCalledTimes(1);
  });
});
