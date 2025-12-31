import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchoolModule } from '../school/school.module';

import { LandingPage } from './entities/landing-page.entity';
import { LandingPageController } from './landing-page.controller';
import { LandingPageService } from './landing-page.service';
import { LandingPageModelAction } from './model-actions/landing-page.action';

@Module({
  imports: [TypeOrmModule.forFeature([LandingPage]), SchoolModule],
  controllers: [LandingPageController],
  providers: [LandingPageService, LandingPageModelAction],
})
export class LandingPageModule {}
