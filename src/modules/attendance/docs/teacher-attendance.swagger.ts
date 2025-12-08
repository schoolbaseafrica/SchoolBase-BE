import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ReviewTeacherManualCheckinResponseDto,
  TeacherAttendanceTodaySummaryResponseDto,
  TeacherCheckinRequestResponseDto,
  TeacherManualCheckinResponseDto,
} from '../dto';
import { TeacherCheckoutResponseDto } from '../dto/teacher-manual-checkout.dto';
import { TeacherManualCheckinStatusEnum } from '../enums';

// --- REVIEW TEACHER CHECKIN REQUEST ---
export const ApiReviewTeacherManualCheckinDocs = () =>
  applyDecorators(
    ApiTags('Attendance'),
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Review teacher manual checkin request (Admin only)',
      description: 'Approve or reject a teacher manual checkin request',
    }),
    ApiParam({
      name: 'id',
      description: 'Checkin request ID',
      type: 'string',
      format: 'uuid',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Request reviewed successfully',
      type: ReviewTeacherManualCheckinResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Request already processed or validation error',
    }),
    ApiNotFoundResponse({
      description: 'Checkin request or teacher not found',
    }),
    ApiConflictResponse({
      description: 'Attendance already marked for this date',
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );

// --- LIST TEACHER CHECKIN REQUESTS ---
export const ApiListTeacherCheckinRequestsDocs = () =>
  applyDecorators(
    ApiTags('Attendance'),
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List teacher checkin requests (Admin only)',
      description:
        'Get all teacher manual checkin requests with optional filters',
    }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: TeacherManualCheckinStatusEnum,
      description: 'Filter by status',
    }),
    ApiQuery({
      name: 'check_in_date',
      required: false,
      type: 'string',
      description: 'Filter by date (YYYY-MM-DD)',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: 'number',
      description: 'Page number',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: 'number',
      description: 'Items per page',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Requests fetched successfully',
      type: [TeacherCheckinRequestResponseDto],
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );

// --- TEACHER CHECKOUT ---
export const ApiTeacherCheckoutDocs = () =>
  applyDecorators(
    ApiTags('Attendance'),
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Teacher checkout (Teacher only)',
      description: 'Check out for the day and calculate total hours worked',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Checkout successful',
      type: TeacherCheckoutResponseDto,
    }),
    ApiBadRequestResponse({
      description:
        'No check-in for today / Already checked out / Pending check-in awaiting approval',
    }),
    ApiNotFoundResponse({
      description: 'Teacher not found',
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );

// --- GET TODAY'S ATTENDANCE SUMMARY ---
export const ApiGetTodayAttendanceSummaryDocs = () =>
  applyDecorators(
    ApiTags('Attendance'),
    ApiBearerAuth(),
    ApiOperation({
      summary: "Get teacher's today attendance summary (Teacher only)",
      description:
        "Returns today's attendance status, check-in/out times, total hours, and method. Returns empty state with has_attendance=false if no attendance exists.",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Attendance summary fetched successfully',
      type: TeacherAttendanceTodaySummaryResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Teacher account is inactive',
    }),
    ApiNotFoundResponse({
      description: 'Teacher not found',
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );

export const ApiCreateTeacherManualCheckinDocs = () =>
  applyDecorators(
    ApiTags('Attendance'),
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Create a new teacher manual checkin (Teacher only)',
      description: 'Create a new teacher manual checkin (Teacher only)',
    }),

    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Teacher manual checkin created successfully',
      type: TeacherManualCheckinResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation error',
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
    ApiConflictResponse({
      description: 'Already checked in for this date',
    }),
    ApiNotFoundResponse({
      description: 'Teacher not found',
    }),
  );

// --- AUTO MANUAL CHECK-IN (MANUAL CHECK-IN WITHOUT ADMIN APPROVAL) ---
export const ApiAutoManualCheckinDocs = () =>
  applyDecorators(
    ApiTags('Attendance'),
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Auto manual check-in (NFC fallback) (Teacher only)',
      description:
        'Manually check in when NFC is unavailable. Automatically marks teacher as Present/Late without admin approval. Date defaults to today if not provided.',
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Check-in successful, attendance marked automatically',
      type: TeacherManualCheckinResponseDto,
    }),
    ApiBadRequestResponse({
      description:
        'Future date / Date too far in past / Check-in time outside school hours / Teacher inactive',
    }),
    ApiConflictResponse({
      description:
        'Already checked in for this date / Pending manual check-in request exists',
    }),
    ApiNotFoundResponse({
      description: 'Teacher not found',
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );
