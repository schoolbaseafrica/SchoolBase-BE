import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { LoginResponseDto } from '../dto/auth-response.dto';

export const LoginDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Login with email and password' }),
    ApiOkResponse({
      description: sysMsg.LOGIN_SUCCESS,
      type: LoginResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: sysMsg.INVALID_CREDENTIALS,
    }),
    ApiBadRequestResponse({
      description: sysMsg.VALIDATION_ERROR,
    }),
  );
