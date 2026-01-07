import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePaletteNullable1767746335839 implements MigrationInterface {
  name = 'MakePaletteNullable1767746335839';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "palette" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "palette" SET NOT NULL`,
    );
  }
}
