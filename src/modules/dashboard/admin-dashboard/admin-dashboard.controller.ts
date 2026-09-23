import { Controller, Get, UseGuards, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../shared/enums';

import { AdminDashboardService } from './admin-dashboard.service';
import { ApiLoadTodayActivities } from './docs/admin-dashboard.swagger';
import { AdminDashboardDataDto } from './dto/admin-dashboard-response.dto';

@Controller('dashboard/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Dashboard')
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('today-activities')
  @Roles(UserRole.ADMIN)
  @ApiLoadTodayActivities()
  async loadTodayActivities(@Query('session_id') sessionId?: string): Promise<{
    message: string;
    status_code: number;
    data: AdminDashboardDataDto;
  }> {
    const data =
      await this.adminDashboardService.loadTodayActivities(sessionId);

    return {
      message: "Today's activities loaded successfully",
      status_code: HttpStatus.OK,
      data,
    };
  }
}
