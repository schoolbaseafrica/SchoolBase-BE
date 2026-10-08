import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InitialSetupGuard } from '../../common/guards/initial-setup.guard';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { LandingPageModule } from '../landing-page/landing-page.module';
import { SuperadminModule } from '../superadmin/superadmin.module';
import { UploadModule } from '../upload/upload.module';

import { School } from './entities/school.entity';
import { SchoolModelAction } from './model-actions/school.action';
import { SchoolSettingsService } from './school-settings.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([School]),
    ActivityLogModule,
    forwardRef(() => LandingPageModule),
    SuperadminModule,
    UploadModule,
  ],
  controllers: [SchoolController],
  providers: [
    SchoolService,
    SchoolSettingsService,
    SchoolModelAction,
    InitialSetupGuard,
  ],
  exports: [SchoolModelAction, SchoolService],
})
export class SchoolModule {}
