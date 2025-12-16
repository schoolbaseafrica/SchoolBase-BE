import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MinioService } from './services/minio.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [ConfigModule],
  controllers: [UploadController],
  providers: [UploadService, MinioService],
  exports: [UploadService, MinioService],
})
export class UploadModule {}
