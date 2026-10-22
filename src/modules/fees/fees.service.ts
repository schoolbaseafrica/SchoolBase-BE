import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource, In } from 'typeorm';
import { Logger } from 'winston';

import * as sysMsg from '../../constants/system.messages';
import { AcademicSessionService } from '../academic-session/academic-session.service';
import { TermModelAction } from '../academic-term/model-actions';
import { TermService } from '../academic-term/term.service';
import { writeActivityLog } from '../activity-log/write-activity-log';
import { ClassModelAction } from '../class/model-actions/class.actions';
import { FeeNotificationService } from '../notification/services/fee-notification.service';
import { PaymentStatus } from '../payment/enums/payment.enums';
import { PaymentService } from '../payment/services/payment.service';
import { FeeNotificationType, UserRole } from '../shared/enums';
import { StudentModelAction } from '../student/model-actions/student-actions';

import { FeeComponentResponseDto } from './dto/fee-component-response.dto';
import { FeeStudentResponseDto } from './dto/fee-students-response.dto';
import { CreateFeesDto, QueryFeesDto, UpdateFeesDto } from './dto/fees.dto';
import { GetActiveFeesDto } from './dto/get-active-fees.dto';
import { StudentFeeDetailsResponseDto } from './dto/student-fee-details.dto';
import { Fees } from './entities/fees.entity';
import { FeeStatus } from './enums/fees.enums';
import { FeeDiscountService } from './fee-discount.service';
import { FeesModelAction } from './model-action/fees.model-action';

export interface IFeeViewer {
  roles: UserRole[];
  student_id?: string;
  parent_id?: string;
}

@Injectable()
export class FeesService {
  private readonly logger: Logger;

  constructor(
    private readonly feesModelAction: FeesModelAction,
    private readonly termModelAction: TermModelAction,
    @Optional()
    private readonly academicSessionService: AcademicSessionService | undefined,
    @Optional()
    private readonly termService: TermService | undefined,
    private readonly classModelAction: ClassModelAction,
    private readonly feeNotificationService: FeeNotificationService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly studentModelAction: StudentModelAction,
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Optional() private readonly feeDiscounts?: FeeDiscountService,
  ) {
    this.logger = logger.child({ context: FeesService.name });
  }

  async create(createFeesDto: CreateFeesDto, createdBy: string): Promise<Fees> {
    const periodType = createFeesDto.period_type ?? 'TERM';
    let sessionId = createFeesDto.session_id;
    if (periodType === 'TERM') {
      if (!createFeesDto.term_id) {
        throw new BadRequestException('A term is required for a term fee');
      }
      const term = await this.termModelAction.get({
        identifierOptions: { id: createFeesDto.term_id },
      });
      if (!term) throw new BadRequestException(sysMsg.TERM_ID_INVALID);
      sessionId = term.sessionId;
    } else if (!sessionId) {
      throw new BadRequestException(
        'An academic session is required for a session-wide fee',
      );
    }

    // Validate that classes exist
    const classesResult = await this.classModelAction.find({
      findOptions: { id: In(createFeesDto.class_ids) },
      transactionOptions: {
        useTransaction: false,
      },
    });

    const classes = classesResult.payload;
    if (classes.length !== createFeesDto.class_ids.length) {
      throw new BadRequestException(sysMsg.INVALID_CLASS_IDS);
    }

    // Create fee
    const savedFee = await this.dataSource.transaction(async (manager) => {
      const fee = await this.feesModelAction.create({
        createPayload: {
          component_name: createFeesDto.component_name,
          description: createFeesDto.description,
          amount: createFeesDto.amount,
          period_type: periodType,
          term_id: periodType === 'TERM' ? createFeesDto.term_id : null,
          session_id: sessionId!,
          created_by: createdBy,
          classes,
        },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });
      await writeActivityLog(manager, {
        actorUserId: createdBy,
        entityType: 'FEE',
        entityId: fee.id,
        action: 'CREATE',
        description: 'Fee component created',
        newValues: { amount: fee.amount, status: fee.status },
      });
      return fee;
    });

    this.logger.info('Fee component created successfully', {
      fee_id: savedFee.id,
      component_name: savedFee.component_name,
      amount: savedFee.amount,
      term: savedFee.term,
      class_count: classes.length,
      created_by: createdBy,
    });

    // TODO: Consider emitting an event here for fee update
    // this.eventEmitter.emit('fee.created', savedFee.id);
    await this.feeNotificationService.createAndUpdateFeesNotification(
      savedFee.id,
      FeeNotificationType.CREATED,
    );
    return savedFee;
  }

  async findAll(queryDto: QueryFeesDto): Promise<{
    fees: Fees[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const scopedQuery = { ...queryDto };
    if (
      !scopedQuery.session_id &&
      !scopedQuery.term_id &&
      this.academicSessionService &&
      this.termService
    ) {
      const [session, term] = await Promise.all([
        this.academicSessionService.activeSessions(),
        this.termService.getActiveTerm(),
      ]);
      scopedQuery.session_id = session.data.id;
      scopedQuery.term_id = term.id;
    }
    const result = await this.feesModelAction.findAllFees(scopedQuery);

    this.logger.info('Fetched fee components', {
      total: result.total,
      page: result.page,
      limit: result.limit,
      filters: queryDto,
    });

    return result;
  }

  async update(
    id: string,
    updateFeesDto: UpdateFeesDto,
    actorUserId?: string,
  ): Promise<Fees> {
    const existingFee = await this.feesModelAction.get({
      identifierOptions: { id },
      relations: { classes: true },
    });

    if (!existingFee) {
      throw new NotFoundException(sysMsg.FEE_NOT_FOUND);
    }

    const scopeChanged =
      updateFeesDto.period_type !== undefined ||
      updateFeesDto.term_id !== undefined ||
      updateFeesDto.session_id !== undefined;
    if (scopeChanged) {
      const nextPeriodType =
        updateFeesDto.period_type ??
        existingFee.period_type ??
        (existingFee.term_id ? 'TERM' : 'SESSION');
      if (nextPeriodType === 'TERM') {
        const termId = updateFeesDto.term_id ?? existingFee.term_id;
        if (!termId)
          throw new BadRequestException('A term is required for a term fee');
        const term = await this.termModelAction.get({
          identifierOptions: { id: termId },
        });
        if (!term) throw new BadRequestException(sysMsg.TERM_ID_INVALID);
        existingFee.period_type = 'TERM';
        existingFee.term_id = termId;
        existingFee.session_id = term.sessionId;
      } else {
        const sessionId = updateFeesDto.session_id ?? existingFee.session_id;
        if (!sessionId) {
          throw new BadRequestException(
            'An academic session is required for a session-wide fee',
          );
        }
        existingFee.period_type = 'SESSION';
        existingFee.session_id = sessionId;
        existingFee.term_id = null;
      }
    }

    // Validate and update classes if provided
    if (updateFeesDto.class_ids) {
      const classesResult = await this.classModelAction.find({
        findOptions: { id: In(updateFeesDto.class_ids) },
        transactionOptions: {
          useTransaction: false,
        },
      });

      const classes = classesResult.payload;
      if (classes.length !== updateFeesDto.class_ids.length) {
        throw new BadRequestException(sysMsg.INVALID_CLASS_IDS);
      }

      existingFee.classes = classes;
    }

    // Update fields
    if (updateFeesDto.component_name !== undefined) {
      existingFee.component_name = updateFeesDto.component_name;
    }
    if (updateFeesDto.description !== undefined) {
      existingFee.description = updateFeesDto.description;
    }
    if (updateFeesDto.amount !== undefined) {
      existingFee.amount = updateFeesDto.amount;
    }
    if (updateFeesDto.status !== undefined) {
      existingFee.status = updateFeesDto.status;
    }

    const updatedFee = await this.dataSource.transaction(async (manager) => {
      const fee = await this.feesModelAction.save({
        entity: existingFee,
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });
      if (actorUserId) {
        await writeActivityLog(manager, {
          actorUserId,
          entityType: 'FEE',
          entityId: id,
          action: 'UPDATE',
          description: 'Fee component updated',
          metadata: { changed_fields: Object.keys(updateFeesDto) },
        });
      }
      return fee;
    });

    this.logger.info('Fee component updated successfully', {
      fee_id: updatedFee.id,
      component_name: updatedFee.component_name,
      amount: updatedFee.amount,
      status: updatedFee.status,
    });

    // TODO: Consider emitting an event here for fee update
    // this.eventEmitter.emit('fee.updated', id);
    await this.feeNotificationService.createAndUpdateFeesNotification(
      id,
      FeeNotificationType.UPDATED,
    );

    return updatedFee;
  }

  async findOne(id: string) {
    const existingFee = await this.feesModelAction.get({
      identifierOptions: { id },
      relations: {
        classes: true,
        term: true,
        createdBy: true,
      },
    });

    if (!existingFee) {
      throw new NotFoundException(sysMsg.FEE_NOT_FOUND);
    }

    // Only include safe fields from createdBy
    const limitedCreator = existingFee.createdBy
      ? {
          id: existingFee.createdBy.id,
          first_name: existingFee.createdBy.first_name,
          last_name: existingFee.createdBy.last_name,
          middle_name: existingFee.createdBy.middle_name,
        }
      : null;

    return {
      ...existingFee,
      createdBy: limitedCreator,
    };
  }

  // fees.service.ts - Fix the deactivate method
  async deactivate(
    id: string,
    deactivatedBy: string,
    reason?: string,
  ): Promise<Fees> {
    // Find the fee component - get method doesn't need transactionOptions
    const fee = await this.feesModelAction.get({
      identifierOptions: { id },
    });

    if (!fee) {
      throw new NotFoundException(sysMsg.FEE_NOT_FOUND);
    }

    // Check if already inactive (idempotent)
    if (fee.status === FeeStatus.INACTIVE) {
      this.logger.info('Fee component is already inactive', {
        fee_id: id,
        deactivated_by: deactivatedBy,
      });
      return fee;
    }

    // Update status to inactive with transactionOptions (only update needs it)
    const updatedFee = await this.dataSource.transaction(async (manager) => {
      const updated = await this.feesModelAction.update({
        identifierOptions: { id },
        updatePayload: { status: FeeStatus.INACTIVE },
        transactionOptions: { useTransaction: true, transaction: manager },
      });
      await writeActivityLog(manager, {
        actorUserId: deactivatedBy,
        entityType: 'FEE',
        entityId: id,
        action: 'DEACTIVATE',
        description: 'Fee component deactivated',
        oldValues: { status: fee.status },
        newValues: { status: FeeStatus.INACTIVE },
        metadata: reason ? { reason } : undefined,
      });
      return updated;
    });

    this.logger.info('Fee component deactivated successfully', {
      fee_id: id,
      component_name: fee.component_name,
      deactivated_by: deactivatedBy,
      reason,
      previous_status: fee.status,
      new_status: FeeStatus.INACTIVE,
    });

    // TODO: Consider emitting an event here for fee update
    // this.eventEmitter.emit('fee.deactivated', id);
    await this.feeNotificationService.createAndUpdateFeesNotification(
      id,
      FeeNotificationType.DEACTIVATED,
    );

    return updatedFee;
  }

  async activate(id: string, activatedBy: string): Promise<Fees> {
    const fee = await this.feesModelAction.get({
      identifierOptions: { id },
    });

    if (!fee) {
      throw new NotFoundException(sysMsg.FEE_NOT_FOUND);
    }

    if (fee.status === FeeStatus.ACTIVE) {
      this.logger.info('Fee component is already active', {
        fee_id: id,
        activated_by: activatedBy,
      });
      return fee;
    }

    const updatedFee = await this.dataSource.transaction(async (manager) => {
      const updated = await this.feesModelAction.update({
        identifierOptions: { id },
        updatePayload: { status: FeeStatus.ACTIVE },
        transactionOptions: { useTransaction: true, transaction: manager },
      });
      await writeActivityLog(manager, {
        actorUserId: activatedBy,
        entityType: 'FEE',
        entityId: id,
        action: 'ACTIVATE',
        description: 'Fee component activated',
        oldValues: { status: fee.status },
        newValues: { status: FeeStatus.ACTIVE },
      });
      return updated;
    });

    this.logger.info('Fee component activated successfully', {
      fee_id: id,
      component_name: fee.component_name,
      activated_by: activatedBy,
      previous_status: fee.status,
      new_status: FeeStatus.ACTIVE,
    });

    // TODO: Consider emitting an event here for fee update
    // this.eventEmitter.emit('fee.activated', id);
    await this.feeNotificationService.createAndUpdateFeesNotification(
      id,
      FeeNotificationType.ACTIVATED,
    );

    return updatedFee;
  }

  async getStudentsForFee(feeId: string): Promise<FeeStudentResponseDto[]> {
    const fee = await this.feesModelAction.getFeeWithStudentAssignments(feeId);

    if (!fee) {
      throw new NotFoundException(sysMsg.FEE_NOT_FOUND);
    }

    const studentMap = new Map<string, FeeStudentResponseDto>();

    if (fee.classes) {
      for (const cls of fee.classes) {
        if (cls.student_assignments) {
          for (const assignment of cls.student_assignments) {
            if (
              assignment.is_active &&
              assignment.student &&
              !assignment.student.is_deleted &&
              assignment.student.user?.is_active
            ) {
              const student = assignment.student;
              studentMap.set(student.id, {
                id: student.id,
                name: `${student.user.first_name} ${student.user.last_name}`,
                class: cls.name,
                session:
                  cls.academicSession?.academicYear ||
                  cls.academicSession?.name ||
                  '',
                registration_number: student.registration_number,
                photo_url: student.photo_url,
              });
            }
          }
        }
      }
    }

    if (fee.direct_assignments) {
      for (const assignment of fee.direct_assignments) {
        if (
          assignment.student &&
          !assignment.student.is_deleted &&
          assignment.student.user?.is_active
        ) {
          const student = assignment.student;
          if (!studentMap.has(student.id)) {
            studentMap.set(student.id, {
              id: student.id,
              name: `${student.user.first_name} ${student.user.last_name}`,
              class: 'N/A',
              session: '',
              registration_number: student.registration_number,
              photo_url: student.photo_url,
            });
          }
        }
      }
    }

    return Array.from(studentMap.values());
  }

  async getActiveFeeComponents(query: GetActiveFeesDto): Promise<{
    data: FeeComponentResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit } = query;
    const {
      fees,
      total,
      page: currentPage,
      limit: currentLimit,
      totalPages,
    } = await this.feesModelAction.getActiveFeeComponents(page, limit);

    const data = fees.map((fee) => ({
      id: fee.id,
      name: fee.component_name,
      amount: Number(fee.amount),
      session_id: fee.session_id,
      term_id: fee.term_id,
      period_type: fee.period_type,
      session:
        fee.academicSession?.academicYear ||
        fee.academicSession?.name ||
        fee.term?.academicSession?.academicYear ||
        fee.term?.academicSession?.name ||
        '',
      term: fee.term?.name || '',
      frequency: fee.period_type === 'SESSION' ? 'Per Session' : 'Per Term',
    }));

    return {
      data,
      total,
      page: currentPage,
      limit: currentLimit,
      totalPages,
    };
  }
  async getStudentFeeDetails(
    studentId: string,
    termId: string,
    sessionId: string,
    viewer: IFeeViewer,
  ): Promise<StudentFeeDetailsResponseDto> {
    const student = await this.studentModelAction.get({
      identifierOptions: { id: studentId },
      relations: {
        user: true,
        class_assignments: { class: { academicSession: true } },
        parent: true,
        stream: true,
      },
    });

    if (!student || student.is_deleted) {
      throw new NotFoundException(sysMsg.STUDENT_NOT_FOUND);
    }

    const canView =
      viewer.roles.includes(UserRole.ADMIN) ||
      (viewer.roles.includes(UserRole.STUDENT) &&
        viewer.student_id === student.id) ||
      (viewer.roles.includes(UserRole.PARENT) &&
        !!viewer.parent_id &&
        viewer.parent_id === student.parent?.id);
    if (!canView) {
      throw new ForbiddenException('You cannot view this student’s fees');
    }

    const term = await this.termModelAction.get({
      identifierOptions: { id: termId },
      relations: { academicSession: true },
    });

    if (!term) {
      throw new BadRequestException(sysMsg.TERM_ID_INVALID);
    }

    if (term.academicSession?.id !== sessionId) {
      throw new BadRequestException(
        'Term does not belong to the specified session',
      );
    }

    const currentEnrollments = (student.class_assignments ?? []).filter(
      (assignment) =>
        assignment.is_active &&
        assignment.session_id === sessionId &&
        assignment.class &&
        !assignment.class.is_deleted &&
        assignment.class.academicSession?.id === sessionId,
    );
    if (currentEnrollments.length > 1) {
      throw new ConflictException(
        'Student has multiple active class enrollments',
      );
    }
    const currentClassAssignment = currentEnrollments[0];
    const currentClass = currentClassAssignment?.class;

    const fees = await this.feesModelAction.getFeesForStudent(
      studentId,
      currentClass?.id,
      termId,
      sessionId,
    );

    const payments: Awaited<
      ReturnType<PaymentService['fetchAllPayments']>
    >['payments'] = [];
    let paymentPage = 1;
    while (true) {
      const batch = await this.paymentService.fetchAllPayments({
        student_id: studentId,
        session_id: sessionId,
        page: paymentPage,
        limit: 1000,
      });
      payments.push(...batch.payments);
      if (!batch.payments.length || payments.length >= batch.total) break;
      paymentPage += 1;
    }

    const visibleFees = new Map(fees.map((fee) => [fee.id, fee]));
    const relevantPayments = payments.filter(
      (payment) =>
        visibleFees.has(payment.fee_component_id) &&
        payment.status === PaymentStatus.PAID &&
        (visibleFees.get(payment.fee_component_id)?.period_type === 'SESSION' ||
          payment.term_id === termId),
    );

    const discount = await this.feeDiscounts?.getStudentDiscount(
      studentId,
      sessionId,
      termId,
    );
    const allocationRows =
      (await this.feeDiscounts?.getAllocations(studentId, sessionId, termId)) ??
      [];
    const allocations = new Map(
      allocationRows.map((row) => [row.fee_id, Number(row.amount)]),
    );

    const feeBreakdown = fees.map((fee) => {
      const paidForComponent = relevantPayments
        .filter((p) => p.fee_component_id === fee.id)
        .reduce((sum, p) => sum + Number(p.amount_paid), 0);

      const amount = Number(fee.amount);
      const discountAmount = allocations.get(fee.id) ?? 0;
      const adjustedAmount = Math.max(0, amount - discountAmount);
      const outstanding = adjustedAmount - paidForComponent;

      let status: 'PAID' | 'PARTIALLY_PAID' | 'OUTSTANDING' = 'OUTSTANDING';
      if (outstanding <= 0) {
        status = 'PAID';
      } else if (paidForComponent > 0) {
        status = 'PARTIALLY_PAID';
      }

      return {
        component_name: fee.component_name,
        amount: amount,
        discount_amount: discountAmount,
        adjusted_amount: adjustedAmount,
        amount_paid: paidForComponent,
        outstanding_amount: Math.max(0, outstanding),
        status,
      };
    });

    return {
      student_info: {
        student_id: student.id,
        first_name: student.user.first_name,
        last_name: student.user.last_name,
        registration_number: student.registration_number,
        class: currentClass?.name || 'N/A',
        term: term.name,
        session: term.academicSession?.academicYear || '',
      },
      fee_breakdown: feeBreakdown,
      discount: discount
        ? {
            id: (discount as { id: string }).id,
            code: (discount as { code: string }).code,
            amount: Number(
              (discount as { discount_amount: string }).discount_amount,
            ),
            status: (discount as { status: string }).status,
            review_id: (discount as { review_id: string | null }).review_id,
          }
        : null,
      totals: {
        original: feeBreakdown.reduce((sum, fee) => sum + fee.amount, 0),
        discount: feeBreakdown.reduce(
          (sum, fee) => sum + fee.discount_amount,
          0,
        ),
        adjusted: feeBreakdown.reduce(
          (sum, fee) => sum + fee.adjusted_amount,
          0,
        ),
        paid: feeBreakdown.reduce((sum, fee) => sum + fee.amount_paid, 0),
        outstanding: feeBreakdown.reduce(
          (sum, fee) => sum + fee.outstanding_amount,
          0,
        ),
      },
      payment_history: relevantPayments.map((p) => ({
        payment_date: p.payment_date,
        amount_paid: Number(p.amount_paid),
        payment_method: p.payment_method,
        transaction_reference: p.transaction_id || p.invoice_number || 'N/A',
        fee_component: p.fee_component?.component_name || 'Unknown',
        term_label: p.term?.name || term.name || 'Unknown Term',
      })),
    };
  }
}
