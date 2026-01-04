import { applyDecorators } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';

import { UploadPictureResponseDto } from '../dto';

/**
 * Swagger decorators for Upload endpoints
 */
export const ApiUploadTags = () => applyDecorators(ApiTags('Upload'));

export const ApiUploadBearerAuth = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiHeader({
      name: 'x-upload-key',
      description:
        'API key for upload access (alternative to JWT Bearer token)',
      required: false,
    }),
  );

/**
 * Swagger decorators for Upload Picture endpoint
 */
export const ApiUploadPicture = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Upload a picture to MinIO',
      description:
        'Uploads an image file (JPEG, PNG, WebP) to MinIO and returns the URL. Maximum file size is 5MB. Authentication: Use either JWT Bearer token OR x-upload-key header.',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Image file to upload (JPEG, PNG, or WebP, max 5MB)',
          },
        },
        required: ['file'],
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Picture uploaded successfully',
      type: UploadPictureResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid file or file too large',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
  );
