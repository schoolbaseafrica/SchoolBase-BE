import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcademicSessionModule } from '../academic-session/academic-session.module';
import { ClassModule } from '../class/class.module';
import { EmailModule } from '../email/email.module';
import { FileModule } from '../shared/file/file.module';
import { UploadModule } from '../upload/upload.module';
import { UserModule } from '../user/user.module';

import { StudentController } from './controllers';
import { Student } from './entities';
import { PhotoCaptureTokenGuard } from './guards/photo-capture-token.guard';
import { StudentModelAction } from './model-actions';
import { StudentService } from './services';
import { StudentBulkImportService } from './services/student-bulk-import.service';
import { StudentPhotoCaptureService } from './services/student-photo-capture.service';

//these import is added on the provide to enable student growth graph calculation

@Module({
  imports: [
    TypeOrmModule.forFeature([Student]),
    UserModule,
    FileModule,
    forwardRef(() => ClassModule),
    AcademicSessionModule,
    EmailModule,
    UploadModule,
  ],
  controllers: [StudentController],
  providers: [
    StudentService,
    StudentModelAction,
    StudentPhotoCaptureService,
    StudentBulkImportService,
    PhotoCaptureTokenGuard,
  ],
  exports: [StudentModelAction, StudentService],
})
export class StudentModule {}
