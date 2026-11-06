import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

import { IMulterFile } from '../../common/types/multer.types';

import { UploadPictureResponseDto } from './dto';
import { MinioService } from './services/minio.service';

@Injectable()
export class UploadService {
  private readonly logger: Logger;

  constructor(
    private readonly minioService: MinioService,
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
  ) {
    this.logger = baseLogger.child({ context: UploadService.name });
  }

  /**
   * Upload a picture to MinIO
   * @param file - The file to upload
   * @param userId - Optional user ID for organizing uploads
   * @returns Upload response with URL and metadata
   */
  async uploadPicture(
    file: IMulterFile,
    userId?: string,
  ): Promise<UploadPictureResponseDto> {
    if (!file?.buffer) throw new BadRequestException('Image file is required');
    this.logger.info(
      `Uploading picture: ${file.originalname} (${file.size} bytes)`,
    );

    try {
      // Determine folder based on user ID if provided
      const folder = userId
        ? `schoolbase-users/${userId}`
        : 'schoolbase-uploads';

      const uploadResult = await this.minioService.uploadImage(file, folder);

      this.logger.info(
        `Picture uploaded successfully: ${uploadResult.publicId}`,
      );

      return {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to upload picture: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async deletePicture(publicId: string): Promise<void> {
    await this.minioService.deleteImage(publicId);
  }

  async uploadReceipt(file: IMulterFile): Promise<UploadPictureResponseDto> {
    if (!file?.buffer)
      throw new BadRequestException('Receipt file is required');
    const uploaded = await this.minioService.uploadImage(file, 'receipts');
    return {
      url: uploaded.url,
      publicId: uploaded.publicId,
      originalName: file.originalname,
      size: file.buffer.length,
      mimetype: file.mimetype,
    };
  }

  async downloadReceipt(
    url: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      throw new BadRequestException('Invalid receipt URL');
    }
    const match = pathname.match(
      /\/receipts\/([a-f0-9-]{36}\.(?:jpg|png|pdf))$/i,
    );
    if (!match)
      throw new BadRequestException('Receipt is not in private storage');
    const extension = match[1].split('.').pop()?.toLowerCase();
    const mimeType =
      extension === 'pdf'
        ? 'application/pdf'
        : extension === 'png'
          ? 'image/png'
          : 'image/jpeg';
    return {
      buffer: await this.minioService.downloadFile(`receipts/${match[1]}`),
      mimeType,
    };
  }
}
