import { Readable } from 'stream';

import { BadGatewayException, NotFoundException } from '@nestjs/common';

import { MinioService } from '../upload/services/minio.service';

import { SchoolMobileAppService } from './school-mobile-app.service';

describe('SchoolMobileAppService', () => {
  const sha = 'a'.repeat(64);
  const release = {
    version: '1.2.3',
    build: 12,
    applicationId: 'com.schoolbaseafrica.demo',
    filename: 'schoolbase-demo-1.2.3-12.apk',
    objectKey: `mobile-app/releases/${sha}.apk`,
    sha256: sha,
    size: 1024,
    publishedAt: '2026-10-09T08:00:00.000Z',
  };
  const minio = {
    statFile: jest.fn(),
    downloadFile: jest.fn(),
    streamFile: jest.fn(),
  };
  const service = new SchoolMobileAppService(minio as unknown as MinioService);

  beforeEach(() => {
    jest.clearAllMocks();
    minio.statFile.mockImplementation(async (key: string) => ({
      size: key === 'mobile-app/current.json' ? 300 : release.size,
    }));
    minio.downloadFile.mockResolvedValue(Buffer.from(JSON.stringify(release)));
    minio.streamFile.mockResolvedValue(Readable.from(['apk']));
  });

  it('returns only a release whose private APK exists at the declared size', async () => {
    await expect(service.getRelease()).resolves.toEqual(release);
    expect(minio.statFile).toHaveBeenCalledWith('mobile-app/current.json');
    expect(minio.statFile).toHaveBeenCalledWith(release.objectKey);
  });

  it('reports an unpublished school without querying another bucket or key', async () => {
    minio.statFile.mockRejectedValueOnce({ code: 'NoSuchKey' });
    await expect(service.getRelease()).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(minio.downloadFile).not.toHaveBeenCalled();
  });

  it('rejects a manifest that points outside the school app release prefix', async () => {
    minio.downloadFile.mockResolvedValueOnce(
      Buffer.from(
        JSON.stringify({ ...release, objectKey: 'receipts/secret.pdf' }),
      ),
    );
    await expect(service.getRelease()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(minio.streamFile).not.toHaveBeenCalled();
  });

  it('rejects a mismatched APK size before opening a download stream', async () => {
    minio.statFile.mockImplementation(async (key: string) => ({
      size: key === 'mobile-app/current.json' ? 300 : release.size - 1,
    }));
    await expect(service.openDownload()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(minio.streamFile).not.toHaveBeenCalled();
  });

  it('streams the verified APK from the school MinIO client', async () => {
    const result = await service.openDownload();
    expect(result.release).toEqual(release);
    expect(result.stream).toBeInstanceOf(Readable);
    expect(minio.streamFile).toHaveBeenCalledWith(release.objectKey);
  });
});
