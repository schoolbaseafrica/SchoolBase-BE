import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import {
  ApplyFeeDiscountDto,
  CreateFeeDiscountCodeDto,
  FeeDiscountReasonDto,
  ReviewFeeDiscountDto,
} from './dto/fee-discount.dto';
import { FeeDiscountService } from './fee-discount.service';

@Controller('fee-discounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FeeDiscountController {
  constructor(private readonly discounts: FeeDiscountService) {}

  @Post('codes')
  createCode(
    @Body() dto: CreateFeeDiscountCodeDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.discounts.createCode(dto, req.user.userId);
  }

  @Get('codes')
  listCodes(
    @Query('session_id') sessionId: string,
    @Query('term_id') termId: string,
  ) {
    return this.discounts.listCodes(sessionId, termId);
  }

  @Patch('codes/:id/deactivate')
  deactivateCode(
    @Param('id') id: string,
    @Body() dto: FeeDiscountReasonDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.discounts.deactivateCode(id, dto.reason, req.user.userId);
  }

  @Post('apply')
  apply(
    @Body() dto: ApplyFeeDiscountDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.discounts.apply(dto, req.user.userId);
  }

  @Patch('redemptions/:id/revoke')
  revoke(
    @Param('id') id: string,
    @Body() dto: FeeDiscountReasonDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.discounts.revoke(id, dto.reason, req.user.userId);
  }

  @Get('preview')
  preview(
    @Query('code') code: string,
    @Query('student_id') studentId: string,
    @Query('session_id') sessionId: string,
    @Query('term_id') termId: string,
  ) {
    return this.discounts.preview(code, studentId, sessionId, termId);
  }

  @Get('reviews')
  listReviews() {
    return this.discounts.listReviews();
  }

  @Patch('reviews/:id')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewFeeDiscountDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.discounts.review(id, dto, req.user.userId);
  }
}
