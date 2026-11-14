import { Readable } from 'stream';

import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MinioService } from '../upload/services/minio.service';

const MANIFEST_KEY = 'mobile-app/current.json';
const MAX_MANIFEST_BYTES = 4096;
const MAX_APK_BYTES = 250 * 1024 * 1024;

export interface ISchoolMobileAppRelease {
  version: string;
  build: number;
  applicationId: string;
  filename: string;
  objectKey: string;
  sha256: string;
  size: number;
  publishedAt: string;
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'NoSuchKey' || code === 'NotFound' || code === 'NoSuchObject';
}

function isRelease(value: unknown): value is ISchoolMobileAppRelease {
  if (!value || typeof value !== 'object') return false;
  const release = value as Record<string, unknown>;
  return (
    typeof release.version === 'string' &&
    /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(release.version) &&
    Number.isSafeInteger(release.build) &&
    (release.build as number) > 0 &&
    typeof release.applicationId === 'string' &&
    /^com\.schoolbaseafrica\.[a-z][a-z0-9_]*$/.test(release.applicationId) &&
    typeof release.filename === 'string' &&
    /^schoolbase-[a-z0-9-]+-[A-Za-z0-9.+-]+\.apk$/.test(release.filename) &&
    typeof release.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(release.sha256) &&
    release.objectKey === `mobile-app/releases/${release.sha256}.apk` &&
    Number.isSafeInteger(release.size) &&
    (release.size as number) > 0 &&
    (release.size as number) <= MAX_APK_BYTES &&
    typeof release.publishedAt === 'string' &&
    !Number.isNaN(Date.parse(release.publishedAt))
  );
}

@Injectable()
export class SchoolMobileAppService {
  constructor(private readonly minio: MinioService) {}

  async getRelease(): Promise<ISchoolMobileAppRelease> {
    let manifestSize: number;
    try {
      manifestSize = (await this.minio.statFile(MANIFEST_KEY)).size;
    } catch (error) {
      if (isMissingObject(error)) {
        throw new NotFoundException(
          'No Android app has been published for this school',
        );
      }
      throw new BadGatewayException('Unable to check the school app');
    }
    if (manifestSize <= 0 || manifestSize > MAX_MANIFEST_BYTES) {
      throw new BadGatewayException('School app manifest is invalid');
    }

    let release: unknown;
    try {
      const buffer = await this.minio.downloadFile(MANIFEST_KEY);
      if (buffer.length > MAX_MANIFEST_BYTES)
        throw new Error('Oversized manifest');
      release = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new BadGatewayException('School app manifest is invalid');
    }
    if (!isRelease(release)) {
      throw new BadGatewayException('School app manifest is invalid');
    }

    try {
      const apk = await this.minio.statFile(release.objectKey);
      if (apk.size !== release.size) {
        throw new BadGatewayException(
          'School app size does not match its manifest',
        );
      }
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('School app file is unavailable');
    }
    return release;
  }

  async openDownload(): Promise<{
    release: ISchoolMobileAppRelease;
    stream: Readable;
  }> {
    const release = await this.getRelease();
    try {
      return {
        release,
        stream: await this.minio.streamFile(release.objectKey),
      };
    } catch {
      throw new BadGatewayException('School app file is unavailable');
    }
  }
}
