import * as path from 'path';

import {
  Injectable,
  BadRequestException,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as minio from 'minio';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'winston';

import { IMulterFile } from '../../../common/types/multer.types';
import * as sysMsg from '../../../constants/system.messages';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger: Logger;
  private minioClient: minio.Client;
  private readonly bucketName: string;
  private readonly publicUrl?: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
  ) {
    this.logger = baseLogger.child({ context: MinioService.name });
    this.bucketName = this.configService.get<string>('minio.bucket');
    this.publicUrl = this.configService
      .get<string>('minio.publicUrl')
      ?.replace(/\/+$/, '');

    // Initialize MinIO client
    this.minioClient = new minio.Client({
      endPoint: this.configService.get('minio.endPoint'),
      port: this.configService.get('minio.port'),
      useSSL: this.configService.get('minio.useSSL'),
      accessKey: this.configService.get('minio.accessKey'),
      secretKey: this.configService.get('minio.secretKey'),
    });
  }

  async onModuleInit() {
    const accessKey = this.configService.get<string>('minio.accessKey') || '';
    this.logger.info(
      `Minio service initialized (${this.storageTarget()}, accessKey=${this.maskAccessKey(accessKey)})`,
    );
    // Optional: Check if bucket exists on startup
    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        this.logger.warn(
          `Bucket ${this.bucketName} does not exist. Creating...`,
        );
        await this.minioClient.makeBucket(this.bucketName, '');
      }
    } catch (error) {
      this.logger.error('Error checking/creating Minio bucket', error);
    }
  }

  /**
   * Upload an image file to Minio
   * @param file - The file to upload (Multer file object)
   * @param folder - Optional folder path (used as prefix in Minio)
   * @returns Promise with url and publicId (mapped to Minio object name)
   */
  async uploadImage(
    file: IMulterFile,
    folder?: string,
  ): Promise<{ url: string; publicId: string }> {
    if (!file || !file.buffer) {
      this.logger.error('Invalid file provided for upload');
      throw new BadRequestException(sysMsg.FILE_REQUIRED);
    }

    try {
      // Generate a unique filename
      const filename = `${uuidv4()}${path.extname(file.originalname)}`;

      // Construct the object path (folder/filename)
      // If folder is provided, use it as a prefix.
      const objectName = folder ? `${folder}/${filename}` : filename;

      // Define metadata
      const metaData = {
        contentType: file.mimetype,
        originalName: file.originalname,
      };

      // Upload to Minio
      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        file.buffer,
        file.size,
        metaData,
      );

      this.logger.info(`Image uploaded successfully to Minio: ${objectName}`);

      // MINIO_ENDPOINT is the private service address. Browser-visible URLs
      // must use the separately configured public base URL.
      const protocol = this.configService.get('minio.useSSL')
        ? 'https'
        : 'http';
      const endPoint = this.configService.get('minio.endPoint');
      const port = this.configService.get('minio.port');

      // Handle standard ports to avoid ugliness (e.g. :80 or :443)
      const portString = port === 80 || port === 443 ? '' : `:${port}`;

      const internalFallback = `${protocol}://${endPoint}${portString}`;
      const publicBaseUrl = this.publicUrl || internalFallback;
      const url = `${publicBaseUrl}/${this.bucketName}/${objectName}`;

      return {
        url: url,
        publicId: objectName, // In S3/Minio terms, the Key is the ID
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown upload error';
      this.logger.error(
        `Failed to upload image to Minio: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(sysMsg.IMAGE_UPLOAD_FAILED);
    }
  }

  async uploadFile(
    file: IMulterFile,
    folder: string,
  ): Promise<{ publicId: string }> {
    if (!file?.buffer) throw new BadRequestException(sysMsg.FILE_REQUIRED);
    const contentType = file.mimetype.split(';')[0].trim().toLowerCase();
    const extension =
      path.extname(file.originalname) || this.extensionFor(contentType);
    const objectName = `${folder}/${uuidv4()}${extension}`;
    this.logger.info(
      `Uploading file to Minio (${this.storageTarget()}, object=${objectName}, contentType=${contentType}, bytes=${file.size})`,
    );
    try {
      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        file.buffer,
      );
      this.logger.info(
        `File uploaded successfully to Minio (bucket=${this.bucketName}, object=${objectName})`,
      );
      return { publicId: objectName };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown upload error';
      const storageError = this.storageErrorDetails(error);
      this.logger.error(
        `Failed to upload file to Minio (${this.storageTarget()}, object=${objectName}, contentType=${contentType}, bytes=${file.size}, ${storageError}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(sysMsg.FILE_UPLOAD_FAILED);
    }
  }

  async downloadFile(publicId: string): Promise<Buffer> {
    const stream = await this.minioClient.getObject(this.bucketName, publicId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private extensionFor(mimeType: string) {
    switch (mimeType.split(';')[0].toLowerCase()) {
      case 'audio/webm':
        return '.webm';
      case 'audio/ogg':
        return '.ogg';
      case 'audio/mp4':
        return '.m4a';
      case 'audio/mpeg':
        return '.mp3';
      case 'audio/wav':
      case 'audio/x-wav':
        return '.wav';
      default:
        return '.bin';
    }
  }

  /**
   * Delete an image from Minio
   * @param publicId - The object name to delete
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await this.minioClient.removeObject(this.bucketName, publicId);
      this.logger.info(`Image deleted from Minio: ${publicId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown deletion error';
      this.logger.error(
        `Failed to delete image from Minio: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException('Failed to delete image');
    }
  }

  private storageTarget() {
    const endpoint = this.configService.get<string>('minio.endPoint');
    const port = this.configService.get<number>('minio.port');
    const useSSL = this.configService.get<boolean>('minio.useSSL');
    return `endpoint=${endpoint}:${port}, ssl=${Boolean(useSSL)}, bucket=${this.bucketName}`;
  }

  private maskAccessKey(accessKey: string) {
    if (!accessKey) return 'missing';
    if (accessKey.length <= 4) return '****';
    return `${accessKey.slice(0, 2)}***${accessKey.slice(-2)}`;
  }

  private storageErrorDetails(error: unknown) {
    if (!error || typeof error !== 'object') return 'code=unknown';
    const details = error as Record<string, unknown>;
    return [
      ['code', details.code],
      ['statusCode', details.statusCode],
      ['requestId', details.requestid ?? details.requestId],
      ['resource', details.resource],
      ['region', details.region],
    ]
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
  }
}
