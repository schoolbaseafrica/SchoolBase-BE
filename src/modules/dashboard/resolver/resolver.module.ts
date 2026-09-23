import { Module } from '@nestjs/common';

import { AcademicSessionModule } from '../../academic-session/academic-session.module';
import { ParentModule } from '../../parent/parent.module';
import { StudentModule } from '../../student/student.module';
import { TeachersModule } from '../../teacher/teacher.module';
import { UserModule } from '../../user/user.module';

import { ResolverController } from './resolver.controller';
import { ResolverService } from './resolver.service';

@Module({
  imports: [
    UserModule,
    TeachersModule,
    StudentModule,
    ParentModule,
    AcademicSessionModule,
  ],
  controllers: [ResolverController],
  providers: [ResolverService],
})
export class ResolverModule {}
