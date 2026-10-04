import { createHash, randomBytes, randomUUID } from 'crypto';

import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as sharp from 'sharp';
import { DataSource } from 'typeorm';

import { IMulterFile } from '../../../common/types/multer.types';
import { MinioService } from '../../upload/services/minio.service';
import { Student } from '../entities/student.entity';

type CaptureLinkRow = {
  id: string;
  student_id: string;
  state: 'pending' | 'complete' | 'revoked';
  expires_at: Date | string;
};

@Injectable()
export class StudentPhotoCaptureService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly minio: MinioService,
  ) {}

  private async studentForUser(userId: string) {
    const student = await this.dataSource.getRepository(Student).findOne({
      where: { user: { id: userId }, is_deleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  async createLink(userId: string) {
    const student = await this.studentForUser(userId);
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT "id" FROM "students" WHERE "id" = $1 FOR UPDATE`,
        [student.id],
      );
      await manager.query(
        `UPDATE "student_photo_capture_links" SET "state" = 'revoked'
         WHERE "student_id" = $1 AND "state" = 'pending'`,
        [student.id],
      );
      await manager.query(
        `INSERT INTO "student_photo_capture_links"
         ("id", "student_id", "token_hash", "expires_at")
         VALUES ($1, $2, $3, $4)`,
        [id, student.id, tokenHash, expiresAt],
      );
      await manager.query(
        `DELETE FROM "student_photo_capture_links" WHERE "expires_at" < now() - interval '1 day'`,
      );
    });

    return { id, token, expiresAt };
  }

  async status(userId: string, linkId: string) {
    const student = await this.studentForUser(userId);
    const rows = (await this.dataSource.query(
      `SELECT "id", "state", "expires_at" FROM "student_photo_capture_links"
       WHERE "id" = $1 AND "student_id" = $2`,
      [linkId, student.id],
    )) as CaptureLinkRow[];
    const link = rows[0];
    if (!link) throw new NotFoundException('Photo link not found');
    const state =
      link.state === 'pending' && new Date(link.expires_at) <= new Date()
        ? 'expired'
        : link.state;
    const latestStudent =
      state === 'complete'
        ? await this.dataSource.getRepository(Student).findOne({
            where: { id: student.id },
            select: ['photo_url'],
          })
        : null;
    return { state, photoUrl: latestStudent?.photo_url ?? null };
  }

  async validateToken(token: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new GoneException('Photo link is invalid or expired');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const rows = (await this.dataSource.query(
      `SELECT "id" FROM "student_photo_capture_links"
       WHERE "token_hash" = $1 AND "state" = 'pending' AND "expires_at" > now()`,
      [hash],
    )) as { id: string }[];
    if (!rows.length)
      throw new GoneException('Photo link is invalid or expired');
    return hash;
  }

  async capture(token: string, file: IMulterFile) {
    const hash = await this.validateToken(token);
    if (!file?.buffer) throw new BadRequestException('Choose a photo');

    let photo: Buffer;
    try {
      photo = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const metadata = await sharp(photo).metadata();
      if ((metadata.width ?? 0) < 480 || (metadata.height ?? 0) < 480) {
        throw new BadRequestException(
          'Photo must be at least 480 by 480 pixels',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Use a clear JPEG, PNG, or WebP photo');
    }

    let uploadedId: string | undefined;
    try {
      const photoUrl = await this.dataSource.transaction(async (manager) => {
        const rows = (await manager.query(
          `SELECT "id", "student_id", "state", "expires_at"
           FROM "student_photo_capture_links" WHERE "token_hash" = $1 FOR UPDATE`,
          [hash],
        )) as CaptureLinkRow[];
        const link = rows[0];
        if (
          !link ||
          link.state !== 'pending' ||
          new Date(link.expires_at) <= new Date()
        ) {
          throw new GoneException('Photo link is invalid or expired');
        }

        const student = await manager.findOne(Student, {
          where: { id: link.student_id, is_deleted: false },
        });
        if (!student) throw new NotFoundException('Student profile not found');

        const uploaded = await this.minio.uploadImage(
          {
            fieldname: 'file',
            buffer: photo,
            encoding: '7bit',
            size: photo.length,
            mimetype: 'image/jpeg',
            originalname: 'student-photo.jpg',
          },
          `schoolbase-users/${student.id}`,
        );
        uploadedId = uploaded.publicId;
        student.photo_url = uploaded.url;
        await manager.save(student);
        await manager.query(
          `UPDATE "student_photo_capture_links" SET "state" = 'complete', "used_at" = now()
           WHERE "id" = $1`,
          [link.id],
        );
        return uploaded.url;
      });
      return { state: 'complete', photoUrl };
    } catch (error) {
      if (uploadedId)
        await this.minio.deleteImage(uploadedId).catch(() => undefined);
      throw error;
    }
  }
}
