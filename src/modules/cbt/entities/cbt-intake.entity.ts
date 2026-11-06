import { Column, Entity, OneToMany } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { CbtApplicant } from './cbt-applicant.entity';

@Entity('cbt_intakes')
export class CbtIntake extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({
    name: 'application_open_from',
    type: 'timestamptz',
    nullable: true,
  })
  applicationOpenFrom: Date | null;

  @Column({ name: 'application_open_to', type: 'timestamptz', nullable: true })
  applicationOpenTo: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @OneToMany(() => CbtApplicant, (applicant) => applicant.intake)
  applicants: CbtApplicant[];
}
