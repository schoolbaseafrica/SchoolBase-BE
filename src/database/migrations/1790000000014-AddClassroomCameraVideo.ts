import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassroomCameraVideo1790000000014 implements MigrationInterface {
  name = 'AddClassroomCameraVideo1790000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_sessions" ADD "allow_student_camera" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_sessions" DROP COLUMN "allow_student_camera"`,
    );
  }
}
