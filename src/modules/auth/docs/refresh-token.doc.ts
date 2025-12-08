import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { RefreshTokenResponseDto } from '../dto/auth-response.dto';

export const RefreshTokenDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Refresh access token using refresh token' }),
    ApiOkResponse({
      description: sysMsg.TOKEN_REFRESH_SUCCESS,
      type: RefreshTokenResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: sysMsg.TOKEN_INVALID,
    }),
    ApiBadRequestResponse({
      description: sysMsg.VALIDATION_ERROR,
    }),
  );
