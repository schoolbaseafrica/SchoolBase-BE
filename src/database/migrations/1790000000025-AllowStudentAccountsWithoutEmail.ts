import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowStudentAccountsWithoutEmail1790000000025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const missing = (await queryRunner.query(
      'SELECT COUNT(*)::int AS count FROM "users" WHERE "email" IS NULL',
    )) as Array<{ count: number }>;
    if (Number(missing[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot require user emails while accounts without email exist',
      );
    }
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL',
    );
  }
}
