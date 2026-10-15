import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
  Get,
  Query,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Response } from 'express';

import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import * as sysMsg from '../../../constants/system.messages';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../shared/enums';
import { FileService } from '../../shared/file/file.service';
import { UploadService } from '../../upload/upload.service';
import { getDashboardAnalyticsDoc } from '../docs/dashboard-analytics.docs';
import { fetchAllPaymentsDoc } from '../docs/fetch-payments.docs';
import { recordPaymentDoc } from '../docs/payment.doc';
import { DashboardAnalyticsQueryDto } from '../dto/dashboard-analytics.dto';
import { FetchPaymentsDto } from '../dto/get-all-payments.dto';
import { PaymentResponseDto, RecordPaymentDto } from '../dto/payment.dto';
import { DashboardAnalyticsService } from '../services/dashboard-analytics.service';
import { PaymentService } from '../services/payment.service';

@ApiTags('Fee Payments')
@Controller('fee-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly fileService: FileService,
    private readonly uploadService: UploadService,
    private readonly dashboardAnalyticsService: DashboardAnalyticsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @recordPaymentDoc()
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('receipt_file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (
          !['image/jpeg', 'image/png', 'application/pdf'].includes(
            file.mimetype,
          )
        ) {
          return cb(
            new BadRequestException('Only JPG, PNG, and PDF files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async recordPayment(
    @Body() dto: RecordPaymentDto,
    @CurrentUser('id') userId: string,
    @UploadedFile() receiptFile?: Express.Multer.File,
  ) {
    let receipt_url: string | undefined;
    let uploadedReceiptKey: string | undefined;

    let payment;
    try {
      if (receiptFile) {
        const uploadedResult =
          await this.uploadService.uploadReceipt(receiptFile);
        uploadedReceiptKey = uploadedResult.publicId;
        const parsedUrl = new URL(uploadedResult.url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new BadRequestException('Invalid receipt URL');
        }
        receipt_url =
          receiptFile.mimetype === 'application/pdf'
            ? uploadedResult.url
            : this.fileService.validatePhotoUrl(uploadedResult.url);
      }
      payment = await this.paymentService.recordPayment(
        dto,
        userId,
        receipt_url,
      );
    } catch (error) {
      if (uploadedReceiptKey)
        await this.uploadService
          .deletePicture(uploadedReceiptKey)
          .catch(() => undefined);
      throw error;
    }

    const response = plainToInstance(PaymentResponseDto, payment, {
      excludeExtraneousValues: true,
    });

    return {
      status_code: HttpStatus.CREATED,
      message: sysMsg.PAYMENT_SUCCESS,
      response,
    };
  }

  @Get(':id/receipt')
  @Roles(UserRole.ADMIN)
  @SkipWrap()
  async downloadReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const receiptUrl = await this.paymentService.receiptUrl(id);
    if (!receiptUrl) throw new NotFoundException('Receipt not found');
    const { buffer, mimeType } =
      await this.uploadService.downloadReceipt(receiptUrl);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', 'attachment; filename="receipt"');
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(buffer);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @fetchAllPaymentsDoc()
  @ApiBearerAuth()
  async fetchAllPayments(@Query() dto: FetchPaymentsDto) {
    const { payments, total } = await this.paymentService.fetchAllPayments(dto);

    const response = payments.map((payment) =>
      plainToInstance(PaymentResponseDto, payment, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      status_code: HttpStatus.OK,
      message: sysMsg.PAYMENTS_FETCHED_SUCCESSFULLY,

      payments: response,
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }

  @Get('dashboard/analytics')
  @Roles(UserRole.ADMIN)
  @getDashboardAnalyticsDoc()
  @ApiBearerAuth()
  async getDashboardAnalytics(@Query() dto: DashboardAnalyticsQueryDto) {
    const data =
      await this.dashboardAnalyticsService.getDashboardAnalytics(dto);

    return {
      message: sysMsg.DASHBOARD_ANALYTICS_FETCHED,
      data,
    };
  }
}
