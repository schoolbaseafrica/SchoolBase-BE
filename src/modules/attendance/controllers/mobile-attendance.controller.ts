import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { IRequestWithUser } from '../../../common/types/request-with-user.interface';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../shared/enums';
import { AttendanceMethodPolicyService } from '../attendance-method-policy.service';
import {
  AssignStudentCardDto,
  BulkAssignCardsDto,
  MobileNfcTapDto,
  UpdateAttendanceMethodsDto,
} from '../dto/mobile-attendance.dto';
import { MobileAttendanceService } from '../mobile-attendance.service';

@Controller('attendance/mobile')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Attendance')
@ApiBearerAuth()
export class MobileAttendanceController {
  constructor(
    private readonly mobile: MobileAttendanceService,
    private readonly policy: AttendanceMethodPolicyService,
  ) {}

  @Get('methods')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  methods() {
    return this.policy.get();
  }

  @Patch('methods')
  @Roles(UserRole.ADMIN)
  updateMethods(@Body() dto: UpdateAttendanceMethodsDto) {
    return this.policy.update(dto.enabledMethods);
  }

  @Get('classes')
  @Roles(UserRole.TEACHER)
  teacherClasses(@Req() req: IRequestWithUser) {
    return this.mobile.teacherClasses(req.user.userId);
  }

  @Post('nfc-tap')
  @Roles(UserRole.TEACHER)
  recordNfcTap(@Req() req: IRequestWithUser, @Body() dto: MobileNfcTapDto) {
    return this.mobile.recordNfcTap(
      req.user.userId,
      dto.classId,
      dto.cardId,
      dto.clientEventId,
    );
  }

  @Post('students/:studentId/card')
  @Roles(UserRole.ADMIN)
  assignCard(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: AssignStudentCardDto,
  ) {
    return this.mobile.assignStudentCard(studentId, dto.cardId);
  }

  @Get('students/:studentId/card')
  @Roles(UserRole.ADMIN)
  getCard(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.mobile.getStudentCard(studentId);
  }

  @Get('students/:studentId/card/qr')
  @Roles(UserRole.ADMIN)
  getCardQr(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.mobile.getStudentCardQr(studentId);
  }

  @Post('students/cards/bulk-assign')
  @Roles(UserRole.ADMIN)
  bulkAssignCards(@Body() dto: BulkAssignCardsDto) {
    return this.mobile.bulkAssignStudentCards(dto.assignments);
  }

  @Get('students/cards/export-csv')
  @Roles(UserRole.ADMIN)
  async exportCards(@Res() response: Response) {
    const csv = await this.mobile.exportStudentCardsCsv();
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="nfc-cards.csv"',
    );
    response.setHeader('Cache-Control', 'no-store');
    response.send(csv);
  }

  @Delete('students/:studentId/card')
  @Roles(UserRole.ADMIN)
  removeCard(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.mobile.removeStudentCard(studentId);
  }
}
