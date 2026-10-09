import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassroomLiveAudio1790000000012 implements MigrationInterface {
  name = 'AddClassroomLiveAudio1790000000012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_sessions" ADD "allow_student_microphone" boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_sessions" DROP COLUMN "allow_student_microphone"`,
    );
  }
}
