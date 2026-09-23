import { Injectable, Optional } from '@nestjs/common';

import { FeesModelAction } from 'src/modules/fees/model-action/fees.model-action';

import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { TermService } from '../../academic-term/term.service';
import {
  DashboardAnalyticsQueryDto,
  DashboardAnalyticsResponseDto,
  IDashboardTotals,
  IMonthlyPaymentData,
} from '../dto/dashboard-analytics.dto';
import { PaymentModelAction } from '../model-action/payment.model-action';

@Injectable()
export class DashboardAnalyticsService {
  constructor(
    private readonly feesModelAction: FeesModelAction,
    private readonly paymentModelAction: PaymentModelAction,
    @Optional()
    private readonly academicSessionService: AcademicSessionService | undefined,
    @Optional()
    private readonly termService: TermService | undefined,
  ) {}

  async getDashboardAnalytics(
    dto: DashboardAnalyticsQueryDto,
  ): Promise<DashboardAnalyticsResponseDto> {
    const scopedDto = { ...dto };
    if (
      !scopedDto.session_id &&
      !scopedDto.term_id &&
      this.academicSessionService &&
      this.termService
    ) {
      const [session, term] = await Promise.all([
        this.academicSessionService.activeSessions(),
        this.termService.getActiveTerm(),
      ]);
      scopedDto.session_id = session.data.id;
      scopedDto.term_id = term.id;
    }
    const year = scopedDto.year || new Date().getFullYear();

    const [totals, monthlyPayments] = await Promise.all([
      this.computeTotals(scopedDto),
      this.computeMonthlyPayments(scopedDto, year),
    ]);

    return {
      totals,
      monthly_payments: monthlyPayments,
    };
  }

  private async computeTotals(
    dto: DashboardAnalyticsQueryDto,
  ): Promise<IDashboardTotals> {
    const [totalFeesAssigned, totalCollected, transactionCount] =
      await Promise.all([
        this.feesModelAction.getTotalExpectedFees(dto.term_id, dto.session_id),
        this.paymentModelAction.getTotalCollected(dto.term_id, dto.session_id),
        this.paymentModelAction.getCurrentMonthTransactionCount(
          dto.term_id,
          dto.session_id,
        ),
      ]);

    return {
      total_expected_fees: totalFeesAssigned,
      total_paid: totalCollected,
      outstanding_balance: totalFeesAssigned - totalCollected,
      transaction_this_month: transactionCount,
    };
  }

  private async computeMonthlyPayments(
    dto: DashboardAnalyticsQueryDto,
    year: number,
  ): Promise<IMonthlyPaymentData[]> {
    const rawResults = await this.paymentModelAction.getMonthlyPaymentBreakdown(
      year,
      dto.term_id,
      dto.session_id,
    );

    const monthlyData: IMonthlyPaymentData[] = [];
    const dataMap = new Map<number, { month: string; total: number }>();

    for (const result of rawResults) {
      const monthNum = parseInt(result.month_number, 10);
      dataMap.set(monthNum, {
        month: result.month,
        total: parseFloat(result.total_payment || '0'),
      });
    }

    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    for (let i = 1; i <= 12; i++) {
      const data = dataMap.get(i);
      monthlyData.push({
        month: data?.month || monthNames[i - 1],
        total_payment: data?.total || 0,
      });
    }

    return monthlyData;
  }
}
