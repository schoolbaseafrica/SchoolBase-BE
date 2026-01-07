import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePaletteNullable1767746335839 implements MigrationInterface {
  name = 'MakePaletteNullable1767746335839';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "teacher_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "teacher_uid" character varying NOT NULL, "user_id" integer NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, CONSTRAINT "UQ_663fbeaaa7b4db3242cbda8767c" UNIQUE ("teacher_uid"), CONSTRAINT "PK_fdd17d62015e40674217a407484" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_2fa" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "two_fa_secret" character varying NOT NULL, "two_fa_enabled" boolean NOT NULL DEFAULT false, "backup_codes" text array, CONSTRAINT "UQ_ed539980faac14226a05368c4d1" UNIQUE ("user_id"), CONSTRAINT "REL_ed539980faac14226a05368c4d" UNIQUE ("user_id"), CONSTRAINT "PK_63a194aa64b4e2039a535a9aa9e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "programs" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "features" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "facilities" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "gallery" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "testimonials" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "faqs" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "palette" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "session" ADD CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_2fa" ADD CONSTRAINT "FK_ed539980faac14226a05368c4d1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_2fa" DROP CONSTRAINT "FK_ed539980faac14226a05368c4d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session" DROP CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53"`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "palette" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "faqs" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "testimonials" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "gallery" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "facilities" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "features" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "landing_pages" ALTER COLUMN "programs" SET DEFAULT '[]'`,
    );
    await queryRunner.query(`DROP TABLE "user_2fa"`);
    await queryRunner.query(`DROP TABLE "session"`);
    await queryRunner.query(`DROP TABLE "teacher_profiles"`);
  }
}
