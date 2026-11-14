import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassroomVoiceNotes1790000000011 implements MigrationInterface {
  name = 'AddClassroomVoiceNotes1790000000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ALTER COLUMN "body" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ADD "message_type" varchar NOT NULL DEFAULT 'text'`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ADD "audio_object_key" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ADD "audio_duration" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ADD "audio_mime_type" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ADD "audio_size" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ADD CONSTRAINT "CHK_virtual_classroom_message_content" CHECK (("message_type" = 'text' AND "body" IS NOT NULL AND "audio_object_key" IS NULL) OR ("message_type" = 'voice' AND "body" IS NULL AND "audio_object_key" IS NOT NULL AND "audio_duration" BETWEEN 1 AND 120))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" DROP CONSTRAINT "CHK_virtual_classroom_message_content"`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" DROP COLUMN "audio_size"`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" DROP COLUMN "audio_mime_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" DROP COLUMN "audio_duration"`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" DROP COLUMN "audio_object_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" DROP COLUMN "message_type"`,
    );
    await queryRunner.query(
      `UPDATE "virtual_classroom_messages" SET "body" = '' WHERE "body" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_messages" ALTER COLUMN "body" SET NOT NULL`,
    );
  }
}
