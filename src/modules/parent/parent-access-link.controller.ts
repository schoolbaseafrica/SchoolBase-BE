import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Request } from 'express';

import { IRequestWithUser } from '../../common/types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { ParentAccessLinkService } from './parent-access-link.service';

class GenerateParentAccessLinkDto {
  @IsInt()
  @Min(1)
  @Max(168)
  expires_in_hours: number = 24;

  @IsBoolean()
  is_single_use: boolean = true;
}

class ValidateParentAccessLinkDto {
  @IsString()
  token: string;
}

class CompleteParentSetupDto extends ValidateParentAccessLinkDto {
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  newPassword: string;
}

@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ParentAccessLinkAdminController {
  constructor(private readonly links: ParentAccessLinkService) {}

  @Post(':parentId/access-links')
  generate(
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Req() req: IRequestWithUser,
    @Body() dto: GenerateParentAccessLinkDto,
  ) {
    return this.links.generate(
      parentId,
      req.user.userId,
      dto.expires_in_hours,
      dto.is_single_use,
    );
  }

  @Get(':parentId/access-links')
  list(@Param('parentId', ParseUUIDPipe) parentId: string) {
    return this.links.list(parentId);
  }

  @Delete('access-links/:linkId')
  revoke(@Param('linkId', ParseUUIDPipe) linkId: string) {
    return this.links.revoke(linkId);
  }
}

@Controller('parent-access-links')
export class ParentAccessLinkPublicController {
  constructor(private readonly links: ParentAccessLinkService) {}

  @Post('validate')
  validate(@Body() dto: ValidateParentAccessLinkDto, @Req() req: Request) {
    return this.links.validate(dto.token, req.ip);
  }

  @Post('complete-setup')
  completeSetup(@Body() dto: CompleteParentSetupDto, @Req() req: Request) {
    return this.links.completeSetup(dto.token, dto.newPassword, req.ip);
  }
}
