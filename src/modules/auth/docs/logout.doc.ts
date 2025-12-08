import { applyDecorators } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { LogoutResponseDto } from '../dto/auth-response.dto';

export const LogoutDocs = () =>
  applyDecorators(
    ApiOperation({ summary: 'Logout user and revoke session' }),
    ApiOkResponse({
      description: sysMsg.LOGOUT_SUCCESS,
      type: LogoutResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: sysMsg.TOKEN_INVALID,
    }),
  );
