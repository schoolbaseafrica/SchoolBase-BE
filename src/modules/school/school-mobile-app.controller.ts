import {
  Controller,
  Get,
  NotFoundException,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { SkipWrap } from '../../common/decorators/skip-wrap.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { SchoolMobileAppService } from './school-mobile-app.service';

@ApiTags('School mobile app')
@ApiBearerAuth()
@Controller('school-app')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SchoolMobileAppController {
  constructor(private readonly service: SchoolMobileAppService) {}

  @Get()
  async getRelease() {
    try {
      return { available: true, release: await this.service.getRelease() };
    } catch (error) {
      if (error instanceof NotFoundException) return { available: false };
      throw error;
    }
  }

  @Get('download')
  @SkipWrap()
  async download(@Res({ passthrough: true }) response: Response) {
    const { release, stream } = await this.service.openDownload();
    response.setHeader(
      'Content-Type',
      'application/vnd.android.package-archive',
    );
    response.setHeader('Content-Length', String(release.size));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${release.filename}"`,
    );
    return new StreamableFile(stream);
  }
}
