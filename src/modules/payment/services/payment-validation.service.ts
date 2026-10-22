import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { FeeDiscountService } from 'src/modules/fees/fee-discount.service';
import { FeesModelAction } from 'src/modules/fees/model-action/fees.model-action';

import * as sysMsg from '../../../constants/system.messages';
import { RecordPaymentDto } from '../dto/payment.dto';
import { PaymentModelAction } from '../model-action/payment.model-action';

@Injectable()
export class PaymentValidationService {
  constructor(
    private readonly feesModelAction: FeesModelAction,
    private readonly feePaymentModelAction: PaymentModelAction,
    @Optional() private readonly feeDiscounts?: FeeDiscountService,
  ) {}

  async validatePayment(dto: RecordPaymentDto): Promise<void> {
    const fee = await this.feesModelAction.get({
      identifierOptions: { id: dto.fee_component_id },
      relations: { classes: true },
    });

    if (!fee) {
      throw new NotFoundException(sysMsg.FEE_NOT_FOUND);
    }

    if (
      fee.session_id !== dto.session_id ||
      (fee.period_type !== 'SESSION' && fee.term_id !== dto.term_id)
    ) {
      throw new BadRequestException(sysMsg.FEE_NOT_FOR_TERM);
    }

    if (
      await this.feeDiscounts?.hasPendingReview(
        dto.student_id,
        dto.session_id,
        dto.term_id,
        fee.period_type === 'SESSION',
      )
    ) {
      throw new BadRequestException(
        'A fee discount change is awaiting review; payments are paused for this bill',
      );
    }

    const total_paid = await this.feePaymentModelAction.getTotalPaidByStudent(
      dto.student_id,
      dto.fee_component_id,
      dto.term_id,
      fee.period_type === 'SESSION',
    );

    const discount = await this.feeDiscounts?.getAllocation(
      dto.student_id,
      dto.fee_component_id,
      dto.term_id,
      fee.period_type === 'SESSION',
    );
    const allowed = Number(fee.amount) - (discount ?? 0);
    const new_total = total_paid + dto.amount_paid;

    if (Math.round(new_total * 100) > Math.round(allowed * 100)) {
      throw new BadRequestException(
        `Payment amount exceeds adjusted fee balance. Fee: ${allowed}, Already paid: ${total_paid}, Attempting: ${dto.amount_paid}`,
      );
    }
  }
}
