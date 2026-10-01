import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { SkipWrap } from '../../common/decorators/skip-wrap.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { ActivityLogService } from './activity-log.service';
import { ListActivityLogsQueryDto } from './dto/list-activity-logs-query.dto';

@ApiTags('Activity Logs')
@ApiBearerAuth()
@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @SkipWrap()
  findAll(@Query() query: ListActivityLogsQueryDto) {
    return this.activityLogService.findAll(query);
  }
}
