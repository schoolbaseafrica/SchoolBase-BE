import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sharp from 'sharp';
import { Logger } from 'winston';

import { IMulterFile } from '../../../common/types/multer.types';

import { MinioService } from './minio.service';

describe('MinioService uploadImage', () => {
  const values = new Map<string, unknown>([
    ['minio.bucket', 'demo'],
    ['minio.publicUrl', 'https://files.schoolbase.africa'],
    ['minio.endPoint', 'minio'],
    ['minio.port', 9000],
    ['minio.useSSL', false],
    ['minio.accessKey', 'key'],
    ['minio.secretKey', 'secret'],
  ]);
  const config = { get: jest.fn((key: string) => values.get(key)) };
  const logger = {
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
  };
  const service = new MinioService(
    config as unknown as ConfigService,
    logger as unknown as Logger,
  );
  const putObject = jest.fn().mockResolvedValue(undefined);
  (service as unknown as { minioClient: unknown }).minioClient = { putObject };

  beforeEach(() => jest.clearAllMocks());

  it('rejects MIME spoofing before storing any object', async () => {
    const file = {
      buffer: Buffer.from('<script>alert(1)</script>'),
      mimetype: 'image/jpeg',
      originalname: 'fake.jpg',
      size: 25,
    } as IMulterFile;
    await expect(service.uploadImage(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(putObject).not.toHaveBeenCalled();
  });

  it('uses a trusted extension and Content-Type for PNG uploads', async () => {
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#da3743' },
    })
      .png()
      .toBuffer();
    const file = {
      buffer,
      mimetype: 'image/png',
      originalname: 'logo.html',
      size: buffer.length,
    } as IMulterFile;
    const result = await service.uploadImage(file, 'logos');
    expect(result.url).toMatch(
      /^https:\/\/files\.schoolbase\.africa\/demo\/logos\/.*\.png$/,
    );
    expect(putObject).toHaveBeenCalledWith(
      'demo',
      result.publicId,
      buffer,
      buffer.length,
      Object.fromEntries([['Content-Type', 'image/png']]),
    );
  });

  it('stores PDF receipts with a PDF content type', async () => {
    const buffer = Buffer.from('%PDF-1.7\n');
    const file = {
      buffer,
      mimetype: 'application/pdf',
      originalname: 'receipt.pdf',
      size: buffer.length,
    } as IMulterFile;
    const result = await service.uploadImage(file, 'receipts');
    expect(result.publicId).toMatch(/\.pdf$/);
    expect(putObject).toHaveBeenCalledWith(
      'demo',
      result.publicId,
      buffer,
      buffer.length,
      Object.fromEntries([['Content-Type', 'application/pdf']]),
    );
  });

  it('stores attachment bytes with a safe object name and attachment disposition', async () => {
    const buffer = Buffer.from('document bytes');
    const file = {
      buffer,
      mimetype: 'application/pdf',
      originalname: 'unsafe.html',
      size: 999,
    } as IMulterFile;
    const result = await service.uploadFile(file, 'assignments/id/student');
    expect(result.publicId).toMatch(/^assignments\/id\/student\/.*\.bin$/);
    expect(putObject).toHaveBeenCalledWith(
      'demo',
      result.publicId,
      buffer,
      buffer.length,
      Object.fromEntries([
        ['Content-Type', 'application/pdf'],
        ['Content-Disposition', 'attachment'],
      ]),
    );
  });
});
