import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentBankAndNotes1790000000034 implements MigrationInterface {
  name = 'PaymentBankAndNotes1790000000034';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "bank_name" varchar(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "description" text`,
    );
  }

  async down(): Promise<void> {
    // These columns may predate this migration in existing installations.
    // Preserve payment data rather than dropping a pre-existing column.
  }
}
