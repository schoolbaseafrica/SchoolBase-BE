import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentBankAndNotes1790000000034 implements MigrationInterface {
  name = 'PaymentBankAndNotes1790000000034';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN "bank_name" varchar(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN "description" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "bank_name"`);
  }
}
