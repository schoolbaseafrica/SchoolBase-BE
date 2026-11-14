import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthModule } from '../auth/auth.module';
import { ClassModule } from '../class/class.module';
import { EmailModule } from '../email/email.module';
import { FileModule } from '../shared/file/file.module';
import { StudentModule } from '../student/student.module';
import { UserModule } from '../user/user.module';

import { Parent } from './entities/parent.entity';
import { ParentModelAction } from './model-actions/parent-actions';
import {
  ParentAccessLinkAdminController,
  ParentAccessLinkPublicController,
} from './parent-access-link.controller';
import { ParentAccessLinkService } from './parent-access-link.service';
import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Parent]),
    FileModule,
    UserModule,
    StudentModule,
    EmailModule,
    ClassModule,
    AuthModule,
  ],
  controllers: [
    ParentController,
    ParentAccessLinkAdminController,
    ParentAccessLinkPublicController,
  ],
  providers: [
    ParentService,
    ParentAccessLinkService,
    ParentModelAction,
    RateLimitGuard,
  ],
  exports: [ParentService, ParentModelAction],
})
export class ParentModule {}
