import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';
import { Column, Entity } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

@Entity('schools')
export class School extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  @IsString()
  @Length(2, 150)
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  @Length(5, 255)
  address?: string;

  @Column({ nullable: true })
  @IsOptional()
  @IsUrl()
  logo_url?: string;

  @Column({ unique: true, nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-()\s]*$/, {
    message: 'phone must contain only numbers and valid phone characters',
  })
  phone?: string;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  primary_color?: string;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  secondary_color?: string;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  accent_color?: string;

  @Column({ default: false })
  installation_completed: boolean;

  @Column({ type: 'uuid', nullable: true })
  owner_user_id?: string | null;

  @Column({ type: 'boolean', default: false })
  use_marketing_site: boolean;

  @Column({ type: 'jsonb', nullable: true })
  marketing_site_config?: Record<string, unknown> | null;

  @Column({ type: 'integer', nullable: true })
  activity_log_retention_days?: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  school_code?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  student_id_format?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'STU' })
  student_id_prefix: string;

  @Column({ type: 'boolean', default: true })
  allow_manual_student_ids: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  teacher_id_format?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'EMP' })
  teacher_id_prefix: string;

  @Column({ type: 'boolean', default: true })
  allow_manual_teacher_ids: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  parent_id_format?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PAR' })
  parent_id_prefix: string;

  @Column({ type: 'boolean', default: true })
  allow_manual_parent_ids: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  staff_id_format?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'STF' })
  staff_id_prefix: string;

  @Column({ type: 'boolean', default: true })
  allow_manual_staff_ids: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () =>
      '\'{"hero_images":[],"gallery_images":[],"testimonials":[]}\'::jsonb',
  })
  landing_page_config?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => `'["NFC"]'::jsonb` })
  attendance_enabled_methods: string[];

  @Column({ type: 'varchar', length: 40, default: 'secugen' })
  fingerprint_provider: string;

  @Column({ comment: 'Dedicated DB connection', type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @Length(10, 500)
  database_url?: string;
}
