import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowRevokedFeeDiscountReapply1790000000035 implements MigrationInterface {
  name = 'AllowRevokedFeeDiscountReapply1790000000035';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_fee_discount_code_student"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fee_discount_code_student" ON "fee_discount_redemptions" ("code_id", "student_id") WHERE "status" <> 'REVOKED'`,
    );
  }

  async down(): Promise<void> {
    // Reapplication may have created multiple historical rows for one student.
    // Retain the partial index rather than fail rollback or discard audit data.
  }
}
