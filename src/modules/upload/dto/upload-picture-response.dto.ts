import { ApiProperty } from '@nestjs/swagger';

export class UploadPictureResponseDto {
  @ApiProperty({
    description: 'The URL of the uploaded picture',
    example: 'https://minio.deenai.app/schoolbase-uploads/sample.jpg',
  })
  url: string;

  @ApiProperty({
    description: 'Public ID of the uploaded image in MinIO (object name)',
    example: 'sample',
  })
  publicId: string;

  @ApiProperty({
    description: 'Original filename',
    example: 'profile-picture.jpg',
  })
  originalName: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 102400,
  })
  size: number;

  @ApiProperty({
    description: 'MIME type of the uploaded file',
    example: 'image/jpeg',
  })
  mimetype: string;
}
