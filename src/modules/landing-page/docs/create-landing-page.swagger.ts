// src/modules/landing-page/docs/landing-page.swagger.ts
import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { LandingPageResponseDto } from '../dto/create-landing-page.dto';

export const ApiCreateLandingPageDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Create landing page',
      description:
        'Creates a new landing page for a school. Each school can only have one landing page. This is typically done during the school setup flow.',
    }),
    ApiCreatedResponse({
      description: sysMsg.LANDING_PAGE_CREATED_SUCCESSFULLY,
      type: LandingPageResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation error - invalid data provided',
    }),
    ApiConflictResponse({
      description: sysMsg.SCHOOL_ALREADY_HAS_A_LANDING_PAGE,
    }),
    ApiNotFoundResponse({
      description: sysMsg.SCHOOL_NOT_FOUND,
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );

export const ApiGetLandingPageBySchoolIdDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get landing page by school ID',
      description:
        'Retrieves the landing page for a specific school. Used to check if landing page setup is complete and to fetch the landing page content.',
    }),
    ApiParam({
      name: 'schoolId',
      description: 'The UUID of the school',
      type: 'string',
      format: 'uuid',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    ApiOkResponse({
      description: sysMsg.LANDING_PAGE_FETCHED_SUCCESSFULLY,
      type: LandingPageResponseDto,
    }),
    ApiNotFoundResponse({
      description: sysMsg.LANDING_PAGE_NOT_FOUND,
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );

export const ApiUpdateLandingPageDocs = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Update landing page',
      description:
        'Updates an existing landing page. Only landing page content can be updated - school_id cannot be changed.',
    }),
    ApiParam({
      name: 'id',
      description: 'The UUID of the landing page',
      type: 'string',
      format: 'uuid',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    ApiOkResponse({
      description: sysMsg.LANDING_PAGE_UPDATED_SUCCESSFULLY,
      type: LandingPageResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation error - invalid data provided',
    }),
    ApiNotFoundResponse({
      description: sysMsg.LANDING_PAGE_NOT_FOUND,
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );
