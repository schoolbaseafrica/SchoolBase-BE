import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import { MinioService } from '../upload/services/minio.service';

import { UploadCbtScreenClipDto } from './cbt-screen-recording.dto';
import { CbtService } from './cbt.service';
import { CbtAttempt, CbtScreenRecording } from './entities';

const MAX_CLIP_BYTES = 15 * 1024 * 1024;
const UPLOAD_GRACE_MS = 2 * 60 * 1000;

@Injectable()
export class CbtScreenRecordingService {
  constructor(
    @InjectRepository(CbtAttempt)
    private readonly attempts: Repository<CbtAttempt>,
    @InjectRepository(CbtScreenRecording)
    private readonly clips: Repository<CbtScreenRecording>,
    private readonly cbt: CbtService,
    private readonly minio: MinioService,
  ) {}

  async uploadForStudent(
    attemptId: string,
    studentId: string,
    file: IMulterFile,
    dto: UploadCbtScreenClipDto,
  ) {
    await this.cbt.getAttempt(attemptId, studentId);
    return this.upload(attemptId, file, dto);
  }

  async uploadForApplicant(
    attemptId: string,
    accessToken: string,
    file: IMulterFile,
    dto: UploadCbtScreenClipDto,
  ) {
    await this.cbt.getPublicAttempt(attemptId, accessToken);
    return this.upload(attemptId, file, dto);
  }

  private async upload(
    attemptId: string,
    file: IMulterFile,
    dto: UploadCbtScreenClipDto,
  ) {
    const attempt = await this.attempts.findOne({
      where: { id: attemptId },
      relations: { exam: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (!['recorded', 'both'].includes(attempt.exam.proctoringMode)) {
      throw new BadRequestException(
        'Screen recording is not enabled for this exam',
      );
    }
    const closeAt = attempt.submittedAt
      ? attempt.submittedAt.getTime()
      : attempt.startedAt.getTime() + attempt.exam.timeLimitMinutes * 60_000;
    if (Date.now() > closeAt + UPLOAD_GRACE_MS) {
      throw new BadRequestException('The recording upload window has closed');
    }

    const existing = await this.clips.findOne({
      where: {
        attemptId,
        recordingId: dto.recordingId,
        partNumber: dto.partNumber,
      },
    });
    if (existing) return this.publicClip(existing);

    const mimeType = file?.mimetype?.split(';')[0].toLowerCase();
    const webm =
      mimeType === 'video/webm' &&
      file?.buffer
        ?.subarray(0, 4)
        .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const mp4 =
      mimeType === 'video/mp4' &&
      file?.buffer?.subarray(4, 8).toString() === 'ftyp';
    if (
      !file?.buffer ||
      file.buffer.length < 100 ||
      file.buffer.length > MAX_CLIP_BYTES ||
      (!webm && !mp4)
    ) {
      throw new BadRequestException(
        'Upload a valid WebM or MP4 screen clip up to 15 MB',
      );
    }

    const uploaded = await this.minio.uploadFile(
      file,
      `cbt-screen-recordings/${attemptId}/${dto.recordingId}`,
    );
    try {
      const saved = await this.clips.save(
        this.clips.create({
          attemptId,
          recordingId: dto.recordingId,
          partNumber: dto.partNumber,
          objectKey: uploaded.publicId,
          mimeType,
          byteSize: file.buffer.length,
          durationMs: dto.durationMs,
        }),
      );
      return this.publicClip(saved);
    } catch (error) {
      await this.minio.deleteImage(uploaded.publicId).catch(() => undefined);
      throw error;
    }
  }

  async listForAdmin(attemptId: string) {
    if (!(await this.attempts.exists({ where: { id: attemptId } }))) {
      throw new NotFoundException('Attempt not found');
    }
    const clips = await this.clips.find({
      where: { attemptId },
      order: { createdAt: 'ASC', recordingId: 'ASC', partNumber: 'ASC' },
    });
    return clips.map((clip) => this.publicClip(clip));
  }

  async streamForAdmin(attemptId: string, clipId: string) {
    const clip = await this.clips.findOne({
      where: { id: clipId, attemptId },
    });
    if (!clip) throw new NotFoundException('Screen clip not found');
    return {
      clip,
      stream: await this.minio.streamFile(clip.objectKey),
    };
  }

  private publicClip(clip: CbtScreenRecording) {
    return {
      id: clip.id,
      recordingId: clip.recordingId,
      partNumber: clip.partNumber,
      mimeType: clip.mimeType,
      byteSize: clip.byteSize,
      durationMs: clip.durationMs,
      createdAt: clip.createdAt,
    };
  }
}
