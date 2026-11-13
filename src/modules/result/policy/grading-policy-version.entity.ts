import { Column, Entity } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

import { IGradingPolicyDefinition } from './grading-policy';

export type GradingPolicyStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';

@Entity('grading_policy_versions')
export class GradingPolicyVersion extends BaseEntity {
  @Column({ name: 'policy_key', type: 'uuid' })
  policyKey: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'term_id', type: 'uuid' })
  termId: string;

  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId: string | null;

  @Column({ type: 'varchar', length: 12 })
  status: GradingPolicyStatus;

  @Column({ type: 'jsonb' })
  definition: IGradingPolicyDefinition;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'activated_by', type: 'uuid', nullable: true })
  activatedBy: string | null;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;
}
