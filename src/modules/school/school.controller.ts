import {
  Controller,
  Get,
  Param,
  Delete,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { InitialSetupGuard } from '../../common/guards/initial-setup.guard';
import { IMulterFile } from '../../common/types/multer.types';
import { pictureUploadConfig } from '../../config/multer.config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';
import { User } from '../user/entities/user.entity';

import { installationApi } from './decorators/installation-api.decorator';
import {
  DocsGetSchoolDetails,
  DocsGetSetupStatus,
} from './docs/school.decorator';
import { CreateInstallationDto } from './dto/create-installation.dto';
import { UpdateMarketingSiteDto } from './dto/update-marketing-site.dto';
import {
  UpdateActivityLogRetentionDto,
  UpdateLandingPageConfigDto,
  UpdateSchoolSettingsDto,
} from './dto/update-school-settings.dto';
import { UpdateWebsiteLayoutDto } from './dto/update-website-layout.dto';
import { SchoolSettingsService } from './school-settings.service';
import { SchoolService } from './school.service';

@ApiTags('School')
@Controller('school')
export class SchoolController {
  constructor(
    private readonly schoolService: SchoolService,
    private readonly settings: SchoolSettingsService,
  ) {}

  @Post('installation')
  @UseGuards(InitialSetupGuard)
  @UseInterceptors(FileInterceptor('logo', pictureUploadConfig))
  @installationApi()
  async processInstallation(
    @Body() createInstallationDto: CreateInstallationDto,
    @UploadedFile() logo?: IMulterFile,
  ) {
    return this.schoolService.processInstallation(createInstallationDto, logo);
  }

  @Get()
  @DocsGetSchoolDetails()
  getSchoolDetails() {
    return this.schoolService.getSchoolDetails();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('logo', pictureUploadConfig))
  async updateSchool(
    @Body() dto: UpdateSchoolSettingsDto,
    @UploadedFile() logo?: IMulterFile,
  ) {
    await this.settings.updateSchool(dto, logo);
    return this.schoolService.getSchoolDetails();
  }

  @Patch('activity-log-retention')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  updateActivityLogRetention(
    @Body() dto: UpdateActivityLogRetentionDto,
    @CurrentUser() actor: User,
  ) {
    return this.settings.updateActivityLogRetention(
      dto.activity_log_retention_days,
      actor.id,
    );
  }

  @Get('landing-page')
  getLandingPageConfig() {
    return this.settings.getLandingPageConfig();
  }

  @Patch('landing-page')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  updateLandingPageConfig(@Body() dto: UpdateLandingPageConfigDto) {
    return this.settings.updateLandingPageConfig(dto.landing_page_config);
  }

  @Patch('website-layout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  updateWebsiteLayout(@Body() dto: UpdateWebsiteLayoutDto) {
    return this.schoolService.updateWebsiteLayout(dto);
  }

  @Patch('marketing-site')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  updateMarketingSite(@Body() dto: UpdateMarketingSiteDto) {
    return this.schoolService.updateMarketingSite(dto);
  }

  @Get('setup-status')
  @DocsGetSetupStatus()
  async getSetupStatus() {
    return this.schoolService.getSetupStatus();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schoolService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schoolService.remove(+id);
  }
}
