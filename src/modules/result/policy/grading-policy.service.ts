import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import {
  evaluateGradingPolicy,
  IGradingPolicyDefinition,
  LEGACY_GRADING_POLICY,
  validateGradingPolicy,
} from './grading-policy';
import { GradingPolicyVersion } from './grading-policy-version.entity';

export interface IResolvedGradingPolicy {
  id: string | null;
  version: number;
  definition: IGradingPolicyDefinition;
}

@Injectable()
export class GradingPolicyService {
  constructor(
    @InjectRepository(GradingPolicyVersion)
    private readonly repository: Repository<GradingPolicyVersion>,
    private readonly dataSource: DataSource,
  ) {}

  async resolve(
    termId: string,
    classId: string,
  ): Promise<IResolvedGradingPolicy> {
    const classPolicy = await this.repository.findOneBy({
      termId,
      classId,
      status: 'ACTIVE',
    });
    const active =
      classPolicy ??
      (await this.repository.findOneBy({
        termId,
        classId: IsNull(),
        status: 'ACTIVE',
      }));
    if (!active) {
      return { id: null, version: 1, definition: LEGACY_GRADING_POLICY };
    }
    try {
      validateGradingPolicy(active.definition);
    } catch {
      throw new InternalServerErrorException(
        'Active grading policy is invalid',
      );
    }
    return {
      id: active.id,
      version: active.version,
      definition: active.definition,
    };
  }

  async list(termId: string): Promise<GradingPolicyVersion[]> {
    return this.repository.find({
      where: { termId },
      order: { createdAt: 'DESC' },
    });
  }

  async saveDraft(
    sessionId: string,
    termId: string,
    classId: string | null,
    definition: IGradingPolicyDefinition,
    actorId: string,
  ): Promise<GradingPolicyVersion> {
    try {
      validateGradingPolicy(definition);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid grading policy',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const term = await manager.query(
        'SELECT id FROM terms WHERE id = $1 AND session_id = $2 FOR UPDATE',
        [termId, sessionId],
      );
      if (term.length === 0)
        throw new BadRequestException('Term does not belong to session');
      if (classId) {
        const classes = await manager.query(
          'SELECT id FROM "class" WHERE id = $1 AND academic_session_id = $2 AND is_deleted = false',
          [classId, sessionId],
        );
        if (classes.length === 0)
          throw new BadRequestException('Class does not belong to session');
      }
      const policies = manager.getRepository(GradingPolicyVersion);
      const draft = await policies.findOneBy({
        termId,
        classId: classId ?? IsNull(),
        status: 'DRAFT',
      });
      if (draft) {
        draft.definition = definition;
        return policies.save(draft);
      }
      const active = await policies.findOneBy({
        termId,
        classId: classId ?? IsNull(),
        status: 'ACTIVE',
      });
      return policies.save(
        policies.create({
          policyKey: active?.policyKey ?? randomUUID(),
          version: active ? active.version + 1 : 1,
          sessionId,
          termId,
          classId,
          status: 'DRAFT',
          definition,
          createdBy: actorId,
          activatedBy: null,
          activatedAt: null,
        }),
      );
    });
  }

  async activate(id: string, actorId: string): Promise<GradingPolicyVersion> {
    return this.dataSource.transaction(async (manager) => {
      const policies = manager.getRepository(GradingPolicyVersion);
      const draft = await policies.findOneBy({ id, status: 'DRAFT' });
      if (!draft) throw new NotFoundException('Draft grading policy not found');
      try {
        validateGradingPolicy(draft.definition);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid grading policy',
        );
      }
      await manager.query('SELECT id FROM terms WHERE id = $1 FOR UPDATE', [
        draft.termId,
      ]);
      const affectedClasses = draft.classId ? 'AND class_id = $2' : '';
      const params = draft.classId
        ? [draft.termId, draft.classId]
        : [draft.termId];
      const submissions = await manager.query(
        `SELECT 1 FROM grade_submissions WHERE term_id = $1 ${affectedClasses} LIMIT 1`,
        params,
      );
      const results = await manager.query(
        `SELECT 1 FROM results WHERE term_id = $1 ${affectedClasses} LIMIT 1`,
        params,
      );
      if (submissions.length || results.length) {
        throw new BadRequestException(
          'This period already has grades or results; a new grading policy cannot be activated',
        );
      }
      const active = await policies.findOneBy({
        termId: draft.termId,
        classId: draft.classId ?? IsNull(),
        status: 'ACTIVE',
      });
      if (active) {
        active.status = 'SUPERSEDED';
        await policies.save(active);
      }
      draft.status = 'ACTIVE';
      draft.activatedBy = actorId;
      draft.activatedAt = new Date();
      return policies.save(draft);
    });
  }

  preview(score: number, definition: IGradingPolicyDefinition) {
    validateGradingPolicy(definition);
    return evaluateGradingPolicy(score, definition);
  }
}
