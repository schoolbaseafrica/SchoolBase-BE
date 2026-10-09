import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InitialSetupGuard } from '../../common/guards/initial-setup.guard';
import { LandingPageModule } from '../landing-page/landing-page.module';
import { SuperadminModule } from '../superadmin/superadmin.module';
import { UploadModule } from '../upload/upload.module';

import { School } from './entities/school.entity';
import { SchoolModelAction } from './model-actions/school.action';
import { SchoolMobileAppController } from './school-mobile-app.controller';
import { SchoolMobileAppService } from './school-mobile-app.service';
import { SchoolSettingsService } from './school-settings.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([School]),
    forwardRef(() => LandingPageModule),
    SuperadminModule,
    UploadModule,
  ],
  controllers: [SchoolController, SchoolMobileAppController],
  providers: [
    SchoolService,
    SchoolSettingsService,
    SchoolModelAction,
    SchoolMobileAppService,
    InitialSetupGuard,
  ],
  exports: [SchoolModelAction, SchoolService],
})
export class SchoolModule {}
