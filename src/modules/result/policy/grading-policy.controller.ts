import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsObject, IsOptional, IsUUID } from 'class-validator';

import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../shared/enums';

import {
  IGradingPolicyDefinition,
  LEGACY_GRADING_POLICY,
  SIX_BAND_MERIT_POLICY,
} from './grading-policy';
import { GradingPolicyService } from './grading-policy.service';

class SaveGradingPolicyDraftDto {
  @IsUUID()
  session_id: string;

  @IsUUID()
  term_id: string;

  @IsOptional()
  @IsUUID()
  class_id?: string;

  @IsObject()
  definition: IGradingPolicyDefinition;
}

interface IRequestWithUser extends Request {
  user: { userId: string };
}

@Controller('grading-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradingPolicyController {
  constructor(private readonly service: GradingPolicyService) {}

  @Get('presets')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  presets() {
    return [
      {
        id: 'schoolbase-classic',
        name: 'SchoolBase Classic',
        definition: LEGACY_GRADING_POLICY,
      },
      {
        id: 'six-band-merit',
        name: 'Six Band Merit',
        definition: SIX_BAND_MERIT_POLICY,
      },
    ];
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query('term_id', ParseUUIDPipe) termId: string) {
    return this.service.list(termId);
  }

  @Get('effective')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  effective(
    @Query('term_id', ParseUUIDPipe) termId: string,
    @Query('class_id', ParseUUIDPipe) classId: string,
  ) {
    return this.service.resolve(termId, classId);
  }

  @Post('draft')
  @Roles(UserRole.ADMIN)
  saveDraft(
    @Body() dto: SaveGradingPolicyDraftDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.service.saveDraft(
      dto.session_id,
      dto.term_id,
      dto.class_id ?? null,
      dto.definition,
      req.user.userId,
    );
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IRequestWithUser,
  ) {
    return this.service.activate(id, req.user.userId);
  }
}
