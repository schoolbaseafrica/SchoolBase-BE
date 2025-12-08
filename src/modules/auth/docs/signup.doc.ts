import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
} from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { SignupResponseDto } from '../dto/auth-response.dto';

export const SignupDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Register a new user' }),
    ApiCreatedResponse({
      description: sysMsg.ACCOUNT_CREATED,
      type: SignupResponseDto,
    }),
    ApiConflictResponse({
      description: sysMsg.ACCOUNT_ALREADY_EXISTS,
    }),
    ApiBadRequestResponse({
      description: sysMsg.VALIDATION_ERROR,
    }),
  );
