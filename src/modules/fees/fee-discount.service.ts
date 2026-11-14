import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { writeActivityLog } from '../activity-log/write-activity-log';

import {
  ApplyFeeDiscountDto,
  CreateFeeDiscountCodeDto,
  ReviewFeeDiscountDto,
} from './dto/fee-discount.dto';

type BillFee = { id: string; amount: string; paid: string; discounted: string };
type DiscountCode = {
  id: string;
  code: string;
  kind: 'PERCENT' | 'AMOUNT';
  value: string;
  session_id: string;
  term_id: string;
  max_uses: number | null;
  expires_at: Date | null;
  is_active: boolean;
};
type Redemption = {
  id: string;
  code_id: string;
  student_id: string;
  session_id: string;
  term_id: string;
  base_total: string;
  discount_amount: string;
  bill_fingerprint: string;
  applied_by: string;
  status: string;
};

const cents = (value: number | string) => Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toFixed(2);

@Injectable()
export class FeeDiscountService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeeDiscountService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    // Fee assignments can change through both class and direct assignment.
    // Reconcile outside the request path so all of those changes are covered.
    this.timer = setInterval(
      () =>
        void this.reconcile().catch((error: unknown) =>
          this.logger.error('Fee discount reconciliation failed', error),
        ),
      60_000,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async bill(
    manager: EntityManager,
    studentId: string,
    sessionId: string,
    termId: string,
    excludeRedemptionId?: string,
  ): Promise<BillFee[]> {
    const period = (await manager.query(
      `SELECT 1 FROM terms WHERE id = $1 AND session_id = $2`,
      [termId, sessionId],
    )) as unknown[];
    if (!period.length)
      throw new BadRequestException('Invalid academic period');
    const student = (await manager.query(
      `SELECT 1 FROM students WHERE id = $1 AND is_deleted = false`,
      [studentId],
    )) as unknown[];
    if (!student.length) throw new NotFoundException('Student not found');
    return (await manager.query(
      `SELECT fee.id, fee.amount,
              COALESCE((SELECT SUM(p.amount_paid) FROM payments p
                        WHERE p.student_id = $1 AND p.fee_component_id = fee.id
                          AND p.status = 'paid'
                          AND (fee.period_type = 'SESSION' OR p.term_id = $3)), 0) AS paid,
              COALESCE((SELECT SUM(a.amount) FROM fee_discount_allocations a
                        JOIN fee_discount_redemptions r ON r.id = a.redemption_id
                        WHERE a.fee_id = fee.id AND r.student_id = $1
                          AND r.status <> 'REVOKED' AND ($4::uuid IS NULL OR r.id <> $4)
                          AND (fee.period_type = 'SESSION' OR r.term_id = $3)), 0) AS discounted
       FROM fees fee
       WHERE fee.session_id = $2 AND fee.status = 'ACTIVE'
         AND (fee.term_id = $3 OR fee.period_type = 'SESSION')
         AND (EXISTS (SELECT 1 FROM fee_assignments direct
                      WHERE direct.fee_id = fee.id AND direct.student_id = $1)
              OR EXISTS (SELECT 1 FROM fee_classes fc
                         JOIN class_students cs ON cs.class_id = fc.class_id
                         WHERE fc.fee_id = fee.id AND cs.student_id = $1
                           AND cs.is_active = true AND cs.session_id = $2::text))
       ORDER BY fee.id`,
      [studentId, sessionId, termId, excludeRedemptionId ?? null],
    )) as BillFee[];
  }

  private summary(fees: BillFee[]) {
    const base = fees.reduce((sum, fee) => sum + cents(fee.amount), 0);
    const paid = fees.reduce((sum, fee) => sum + cents(fee.paid), 0);
    const fingerprint = JSON.stringify(
      fees.map((fee) => [fee.id, cents(fee.amount)]),
    );
    return { base, paid, fingerprint };
  }

  private discount(base: number, code: DiscountCode): number {
    return Math.min(
      base,
      code.kind === 'PERCENT'
        ? Math.round((base * Number(code.value)) / 100)
        : cents(code.value),
    );
  }

  private allocate(fees: BillFee[], amount: number) {
    const headroom = fees.map((fee) =>
      Math.max(0, cents(fee.amount) - cents(fee.paid) - cents(fee.discounted)),
    );
    const capacity = headroom.reduce((sum, item) => sum + item, 0);
    if (amount > capacity) {
      throw new ConflictException(
        'Discount exceeds the unpaid balance; review existing payments first',
      );
    }
    const allocations = headroom.map((room) =>
      capacity ? Math.floor((amount * room) / capacity) : 0,
    );
    let remainder = amount - allocations.reduce((sum, item) => sum + item, 0);
    for (let index = 0; remainder > 0; index = (index + 1) % fees.length) {
      if (allocations[index] < headroom[index]) {
        allocations[index]++;
        remainder--;
      }
    }
    return fees.map((fee, index) => ({
      feeId: fee.id,
      amount: allocations[index],
    }));
  }

  private async saveAllocations(
    manager: EntityManager,
    redemptionId: string,
    allocations: Array<{ feeId: string; amount: number }>,
  ) {
    await manager.query(
      `DELETE FROM fee_discount_allocations WHERE redemption_id = $1`,
      [redemptionId],
    );
    for (const allocation of allocations.filter((item) => item.amount > 0)) {
      await manager.query(
        `INSERT INTO fee_discount_allocations (redemption_id, fee_id, amount)
         VALUES ($1, $2, $3)`,
        [redemptionId, allocation.feeId, money(allocation.amount)],
      );
    }
  }

  async createCode(dto: CreateFeeDiscountCodeDto, actorId: string) {
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,48}$/.test(code))
      throw new BadRequestException(
        'Use 4–48 letters, digits, hyphens or underscores',
      );
    if (dto.kind === 'PERCENT' && dto.value > 100)
      throw new BadRequestException('Percentage cannot exceed 100');
    if (dto.expires_at && new Date(dto.expires_at) <= new Date())
      throw new BadRequestException('Expiry must be in the future');
    return this.dataSource.transaction(async (manager) => {
      const period = (await manager.query(
        `SELECT 1 FROM terms WHERE id = $1 AND session_id = $2`,
        [dto.term_id, dto.session_id],
      )) as unknown[];
      if (!period.length)
        throw new BadRequestException('Invalid academic period');
      const existing = (await manager.query(
        `SELECT 1 FROM fee_discount_codes WHERE code = $1`,
        [code],
      )) as unknown[];
      if (existing.length)
        throw new ConflictException('Discount code already exists');
      const rows = (await manager.query(
        `INSERT INTO fee_discount_codes
         (code, kind, value, session_id, term_id, expires_at, max_uses, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          code,
          dto.kind,
          dto.value,
          dto.session_id,
          dto.term_id,
          dto.expires_at ?? null,
          dto.max_uses ?? null,
          actorId,
        ],
      )) as DiscountCode[];
      await writeActivityLog(manager, {
        actorUserId: actorId,
        entityType: 'FEE_DISCOUNT',
        entityId: rows[0].id,
        action: 'CREATE',
        description: 'Fee discount code created',
        newValues: { code, kind: dto.kind, value: dto.value },
      });
      return rows[0];
    });
  }

  async listCodes(sessionId: string, termId: string) {
    return this.dataSource.query(
      `SELECT code.*, (SELECT COUNT(*)::int FROM fee_discount_redemptions r
                       WHERE r.code_id = code.id AND r.status <> 'REVOKED') AS uses
       FROM fee_discount_codes code
       WHERE code.session_id = $1 AND code.term_id = $2
       ORDER BY code.created_at DESC`,
      [sessionId, termId],
    );
  }

  async deactivateCode(codeId: string, reason: string, actorId: string) {
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `UPDATE fee_discount_codes SET is_active = false, updated_at = now()
         WHERE id = $1 AND is_active = true RETURNING id, code`,
        [codeId],
      )) as Array<{ id: string; code: string }>;
      if (!rows[0])
        throw new NotFoundException('Active discount code not found');
      await writeActivityLog(manager, {
        actorUserId: actorId,
        entityType: 'FEE_DISCOUNT',
        entityId: codeId,
        action: 'DEACTIVATE',
        description: 'Fee discount code deactivated',
        newValues: { code: rows[0].code, reason },
      });
      return { id: codeId, is_active: false };
    });
  }

  async revoke(redemptionId: string, reason: string, actorId: string) {
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT * FROM fee_discount_redemptions WHERE id = $1 FOR UPDATE`,
        [redemptionId],
      )) as Redemption[];
      const redemption = rows[0];
      if (!redemption || redemption.status === 'REVOKED')
        throw new NotFoundException('Active student discount not found');
      await manager.query(
        `UPDATE fee_discount_reviews SET status = 'REJECTED', decided_by = $2,
           decided_at = now(), decision_reason = $3
         WHERE redemption_id = $1 AND status = 'PENDING'`,
        [redemptionId, actorId, `Discount revoked: ${reason}`],
      );
      await manager.query(
        `UPDATE fee_discount_redemptions SET status = 'REVOKED', reviewed_by = $2,
           reviewed_at = now(), review_reason = $3, updated_at = now()
         WHERE id = $1`,
        [redemptionId, actorId, reason],
      );
      await writeActivityLog(manager, {
        actorUserId: actorId,
        entityType: 'FEE_DISCOUNT',
        entityId: redemptionId,
        action: 'REVOKE',
        description: 'Student fee discount revoked',
        oldValues: {
          status: redemption.status,
          discount_amount: redemption.discount_amount,
        },
        newValues: { status: 'REVOKED', reason },
      });
      return { id: redemptionId, status: 'REVOKED' };
    });
  }

  async apply(dto: ApplyFeeDiscountDto, actorId: string) {
    return this.dataSource.transaction(async (manager) => {
      const codes = (await manager.query(
        `SELECT * FROM fee_discount_codes WHERE code = $1 FOR UPDATE`,
        [dto.code.trim().toUpperCase()],
      )) as DiscountCode[];
      const code = codes[0];
      if (
        !code ||
        !code.is_active ||
        (code.expires_at && code.expires_at <= new Date())
      )
        throw new BadRequestException('Discount code is unavailable');
      if (code.session_id !== dto.session_id || code.term_id !== dto.term_id)
        throw new BadRequestException(
          'Code does not cover this academic period',
        );
      const students = (await manager.query(
        `SELECT id FROM students WHERE id = $1 AND is_deleted = false FOR UPDATE`,
        [dto.student_id],
      )) as unknown[];
      if (!students.length) throw new NotFoundException('Student not found');
      const used = (await manager.query(
        `SELECT COUNT(*)::int AS count FROM fee_discount_redemptions
         WHERE code_id = $1 AND status <> 'REVOKED'`,
        [code.id],
      )) as Array<{ count: number }>;
      if (code.max_uses !== null && Number(used[0].count) >= code.max_uses)
        throw new ConflictException('Discount code has reached its use limit');
      const prior = (await manager.query(
        `SELECT 1 FROM fee_discount_redemptions
         WHERE student_id = $1 AND session_id = $2 AND term_id = $3
           AND status <> 'REVOKED'`,
        [dto.student_id, dto.session_id, dto.term_id],
      )) as unknown[];
      if (prior.length)
        throw new ConflictException(
          'Student already has a discount for this period',
        );
      const usedByStudent = (await manager.query(
        `SELECT 1 FROM fee_discount_redemptions WHERE code_id = $1 AND student_id = $2
         AND status <> 'REVOKED'`,
        [code.id, dto.student_id],
      )) as unknown[];
      if (usedByStudent.length)
        throw new ConflictException('This student has used the code before');
      let fees = await this.bill(
        manager,
        dto.student_id,
        dto.session_id,
        dto.term_id,
      );
      if (!fees.length)
        throw new BadRequestException('No assigned fees for this student');
      await manager.query(
        `SELECT id FROM fees WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [fees.map((fee) => fee.id)],
      );
      fees = await this.bill(
        manager,
        dto.student_id,
        dto.session_id,
        dto.term_id,
      );
      const { base, paid, fingerprint } = this.summary(fees);
      const amount = this.discount(base, code);
      if (!amount) throw new BadRequestException('Discount amount is zero');
      const allocations = this.allocate(fees, amount);
      const rows = (await manager.query(
        `INSERT INTO fee_discount_redemptions
         (code_id, student_id, session_id, term_id, base_total, bill_fingerprint,
          discount_amount, applied_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          code.id,
          dto.student_id,
          dto.session_id,
          dto.term_id,
          money(base),
          fingerprint,
          money(amount),
          actorId,
        ],
      )) as Redemption[];
      await this.saveAllocations(manager, rows[0].id, allocations);
      await writeActivityLog(manager, {
        actorUserId: actorId,
        entityType: 'FEE_DISCOUNT',
        entityId: rows[0].id,
        action: 'APPLY',
        description: 'Student fee discount applied',
        newValues: {
          student_id: dto.student_id,
          code: code.code,
          base_total: money(base),
          discount_amount: money(amount),
          paid: money(paid),
        },
      });
      return rows[0];
    });
  }

  async preview(
    codeText: string,
    studentId: string,
    sessionId: string,
    termId: string,
  ) {
    const rows = (await this.dataSource.query(
      `SELECT * FROM fee_discount_codes WHERE code = $1`,
      [codeText.trim().toUpperCase()],
    )) as DiscountCode[];
    const code = rows[0];
    if (
      !code ||
      !code.is_active ||
      (code.expires_at && code.expires_at <= new Date())
    )
      throw new BadRequestException('Discount code is unavailable');
    if (code.session_id !== sessionId || code.term_id !== termId)
      throw new BadRequestException('Code does not cover this academic period');
    const used = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM fee_discount_redemptions
       WHERE code_id = $1 AND status <> 'REVOKED'`,
      [code.id],
    )) as Array<{ count: number }>;
    if (code.max_uses !== null && Number(used[0].count) >= code.max_uses)
      throw new ConflictException('Discount code has reached its use limit');
    const prior = (await this.dataSource.query(
      `SELECT 1 FROM fee_discount_redemptions WHERE student_id = $1
       AND session_id = $2 AND term_id = $3 AND status <> 'REVOKED'`,
      [studentId, sessionId, termId],
    )) as unknown[];
    if (prior.length)
      throw new ConflictException(
        'Student already has a discount for this period',
      );
    const usedByStudent = (await this.dataSource.query(
      `SELECT 1 FROM fee_discount_redemptions WHERE code_id = $1 AND student_id = $2
       AND status <> 'REVOKED'`,
      [code.id, studentId],
    )) as unknown[];
    if (usedByStudent.length)
      throw new ConflictException('This student has used the code before');
    const fees = await this.bill(
      this.dataSource.manager,
      studentId,
      sessionId,
      termId,
    );
    if (!fees.length)
      throw new BadRequestException('No assigned fees for this student');
    const { base, paid } = this.summary(fees);
    const amount = this.discount(base, code);
    this.allocate(fees, amount);
    return {
      original: Number(money(base)),
      discount: Number(money(amount)),
      adjusted: Number(money(base - amount)),
      paid: Number(money(paid)),
      balance: Number(money(Math.max(0, base - amount - paid))),
    };
  }

  async getStudentDiscount(
    studentId: string,
    sessionId: string,
    termId: string,
  ) {
    const rows = (await this.dataSource.query(
      `SELECT r.id, r.base_total, r.discount_amount, r.status, r.applied_at,
              c.code, c.kind, c.value,
              rev.id AS review_id, rev.proposed_base_total, rev.proposed_discount_amount
       FROM fee_discount_redemptions r
       JOIN fee_discount_codes c ON c.id = r.code_id
       LEFT JOIN fee_discount_reviews rev ON rev.redemption_id = r.id AND rev.status = 'PENDING'
       WHERE r.student_id = $1 AND r.session_id = $2 AND r.term_id = $3
         AND r.status <> 'REVOKED'`,
      [studentId, sessionId, termId],
    )) as unknown[];
    return rows[0] ?? null;
  }

  async getAllocations(studentId: string, sessionId: string, termId: string) {
    return (await this.dataSource.query(
      `SELECT a.fee_id, SUM(a.amount) AS amount
       FROM fee_discount_allocations a
       JOIN fee_discount_redemptions r ON r.id = a.redemption_id
       JOIN fees fee ON fee.id = a.fee_id
       WHERE r.student_id = $1 AND r.session_id = $2 AND r.status <> 'REVOKED'
         AND (fee.period_type = 'SESSION' OR r.term_id = $3)
       GROUP BY a.fee_id`,
      [studentId, sessionId, termId],
    )) as Array<{ fee_id: string; amount: string }>;
  }

  async getAllocation(
    studentId: string,
    feeId: string,
    termId: string,
    sessionWide = false,
  ) {
    const rows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(a.amount), 0) AS amount
       FROM fee_discount_allocations a
       JOIN fee_discount_redemptions r ON r.id = a.redemption_id
       WHERE r.student_id = $1 AND ($4 OR r.term_id = $3) AND r.status <> 'REVOKED'
         AND a.fee_id = $2`,
      [studentId, feeId, termId, sessionWide],
    )) as Array<{ amount: string }>;
    return Number(rows[0]?.amount ?? 0);
  }

  async hasPendingReview(
    studentId: string,
    sessionId: string,
    termId: string,
    sessionWide = false,
  ) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM fee_discount_redemptions
       WHERE student_id = $1 AND session_id = $2 AND ($4 OR term_id = $3)
         AND status = 'PENDING_REVIEW' LIMIT 1`,
      [studentId, sessionId, termId, sessionWide],
    )) as unknown[];
    return rows.length > 0;
  }

  async totalApprovedDiscount(termId?: string, sessionId?: string) {
    const rows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(a.amount), 0) AS total
       FROM fee_discount_allocations a
       JOIN fee_discount_redemptions r ON r.id = a.redemption_id
       JOIN fees fee ON fee.id = a.fee_id
       WHERE r.status <> 'REVOKED'
         AND ($1::uuid IS NULL OR r.term_id = $1 OR fee.period_type = 'SESSION')
         AND ($2::uuid IS NULL OR r.session_id = $2)`,
      [termId ?? null, sessionId ?? null],
    )) as Array<{ total: string }>;
    return Number(rows[0]?.total ?? 0);
  }

  async listReviews() {
    return this.dataSource.query(
      `SELECT rev.*, r.student_id, r.applied_by, c.code,
              student.registration_number,
              usr.first_name || ' ' || usr.last_name AS student_name
       FROM fee_discount_reviews rev
       JOIN fee_discount_redemptions r ON r.id = rev.redemption_id
       JOIN fee_discount_codes c ON c.id = r.code_id
       JOIN students student ON student.id = r.student_id
       JOIN users usr ON usr.id = student.user_id
       WHERE rev.status = 'PENDING' ORDER BY rev.requested_at`,
    );
  }

  async review(reviewId: string, dto: ReviewFeeDiscountDto, actorId: string) {
    return this.dataSource.transaction(async (manager) => {
      const reviews = (await manager.query(
        `SELECT * FROM fee_discount_reviews WHERE id = $1 FOR UPDATE`,
        [reviewId],
      )) as Array<{
        id: string;
        redemption_id: string;
        status: string;
        proposed_fingerprint: string;
      }>;
      const review = reviews[0];
      if (!review || review.status !== 'PENDING')
        throw new NotFoundException('Pending review not found');
      const redemptions = (await manager.query(
        `SELECT * FROM fee_discount_redemptions WHERE id = $1 FOR UPDATE`,
        [review.redemption_id],
      )) as Redemption[];
      const redemption = redemptions[0];
      if (redemption.applied_by === actorId)
        throw new ConflictException(
          'The applier cannot approve their own discount',
        );
      let fees = await this.bill(
        manager,
        redemption.student_id,
        redemption.session_id,
        redemption.term_id,
        redemption.id,
      );
      if (fees.length) {
        await manager.query(
          `SELECT id FROM fees WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
          [fees.map((fee) => fee.id)],
        );
        fees = await this.bill(
          manager,
          redemption.student_id,
          redemption.session_id,
          redemption.term_id,
          redemption.id,
        );
      }
      const { base, fingerprint } = this.summary(fees);
      if (fingerprint !== review.proposed_fingerprint)
        throw new ConflictException(
          'The bill changed again; refresh the review',
        );
      if (dto.approve) {
        const codes = (await manager.query(
          `SELECT * FROM fee_discount_codes WHERE id = $1`,
          [redemption.code_id],
        )) as DiscountCode[];
        const amount = this.discount(base, codes[0]);
        const allocations = this.allocate(fees, amount);
        await this.saveAllocations(manager, redemption.id, allocations);
        await manager.query(
          `UPDATE fee_discount_redemptions SET base_total = $2, bill_fingerprint = $3,
             discount_amount = $4, status = 'ACTIVE', reviewed_by = $5,
             reviewed_at = now(), review_reason = $6, updated_at = now()
           WHERE id = $1`,
          [
            redemption.id,
            money(base),
            fingerprint,
            money(amount),
            actorId,
            dto.reason,
          ],
        );
      } else {
        const allocations = this.allocate(
          fees,
          cents(redemption.discount_amount),
        );
        await this.saveAllocations(manager, redemption.id, allocations);
        await manager.query(
          `UPDATE fee_discount_redemptions SET status = 'ACTIVE', base_total = $2,
             bill_fingerprint = $3, reviewed_by = $4, reviewed_at = now(),
             review_reason = $5, updated_at = now() WHERE id = $1`,
          [redemption.id, money(base), fingerprint, actorId, dto.reason],
        );
      }
      await manager.query(
        `UPDATE fee_discount_reviews SET status = $2, decided_by = $3,
           decided_at = now(), decision_reason = $4 WHERE id = $1`,
        [reviewId, dto.approve ? 'APPROVED' : 'REJECTED', actorId, dto.reason],
      );
      await writeActivityLog(manager, {
        actorUserId: actorId,
        entityType: 'FEE_DISCOUNT',
        entityId: redemption.id,
        action: dto.approve ? 'APPROVE' : 'REJECT',
        description: 'Student fee discount review decided',
        newValues: { review_id: reviewId, reason: dto.reason },
      });
      return { status: dto.approve ? 'APPROVED' : 'REJECTED' };
    });
  }

  async reconcile() {
    const redemptions = (await this.dataSource.query(
      `SELECT r.* FROM fee_discount_redemptions r
       JOIN students s ON s.id = r.student_id
       WHERE r.status = 'ACTIVE' AND s.is_deleted = false`,
    )) as Redemption[];
    for (const redemption of redemptions) {
      await this.dataSource.transaction(async (manager) => {
        const locked = (await manager.query(
          `SELECT * FROM fee_discount_redemptions WHERE id = $1 FOR UPDATE`,
          [redemption.id],
        )) as Redemption[];
        if (locked[0]?.status !== 'ACTIVE') return;
        let fees = await this.bill(
          manager,
          redemption.student_id,
          redemption.session_id,
          redemption.term_id,
          redemption.id,
        );
        if (fees.length) {
          await manager.query(
            `SELECT id FROM fees WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
            [fees.map((fee) => fee.id)],
          );
          fees = await this.bill(
            manager,
            redemption.student_id,
            redemption.session_id,
            redemption.term_id,
            redemption.id,
          );
        }
        const { base, fingerprint } = this.summary(fees);
        if (fingerprint === redemption.bill_fingerprint) return;
        const previous = (await manager.query(
          `SELECT 1 FROM fee_discount_reviews WHERE redemption_id = $1
           AND proposed_fingerprint = $2 AND status IN ('PENDING','REJECTED')`,
          [redemption.id, fingerprint],
        )) as unknown[];
        if (previous.length) return;
        try {
          const allocations = this.allocate(
            fees,
            cents(redemption.discount_amount),
          );
          await this.saveAllocations(manager, redemption.id, allocations);
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error;
          this.logger.warn(
            `Discount ${redemption.id} needs review before its existing amount can fit the changed bill`,
          );
        }
        const codes = (await manager.query(
          `SELECT * FROM fee_discount_codes WHERE id = $1`,
          [redemption.code_id],
        )) as DiscountCode[];
        const proposed = this.discount(base, codes[0]);
        const reviews = (await manager.query(
          `INSERT INTO fee_discount_reviews
           (redemption_id, old_base_total, proposed_base_total,
            old_discount_amount, proposed_discount_amount, proposed_fingerprint, reason)
           VALUES ($1,$2,$3,$4,$5,$6,'Assigned fees changed')
           RETURNING id`,
          [
            redemption.id,
            redemption.base_total,
            money(base),
            redemption.discount_amount,
            money(proposed),
            fingerprint,
          ],
        )) as Array<{ id: string }>;
        await manager.query(
          `UPDATE fee_discount_redemptions SET status = 'PENDING_REVIEW',
           updated_at = now() WHERE id = $1`,
          [redemption.id],
        );
        await manager.query(
          `INSERT INTO notifications (recipient_id, title, message, type, is_read, metadata)
           SELECT id, 'Fee discount needs review',
                  'A student fee bill changed after a discount was applied.',
                  'FEE_UPDATE', false, $1::jsonb
           FROM users WHERE is_active = true AND deleted_at IS NULL
             AND 'ADMIN' = ANY(role)`,
          [
            JSON.stringify({
              review_id: reviews[0].id,
              student_id: redemption.student_id,
              deep_link: '/admin/fee-management',
            }),
          ],
        );
      });
    }
  }
}
