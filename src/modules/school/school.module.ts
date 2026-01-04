import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LandingPageModule } from '../landing-page/landing-page.module';
import { SuperadminModule } from '../superadmin/superadmin.module';

import { School } from './entities/school.entity';
import { SchoolModelAction } from './model-actions/school.action';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([School]),
    forwardRef(() => LandingPageModule),
    SuperadminModule,
  ],
  controllers: [SchoolController],
  providers: [SchoolService, SchoolModelAction],
  exports: [SchoolModelAction, SchoolService],
})
export class SchoolModule {}
