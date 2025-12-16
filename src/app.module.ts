import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GlobalExceptionFilter } from './common/exceptions/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggerModule } from './common/logger.module';
import configuration from './config/config';
import { LoggingInterceptor } from './middleware/logging.interceptor';
import { AcademicSessionModule } from './modules/academic-session/academic-session.module';
import { TermModule } from './modules/academic-term/term.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassModule } from './modules/class/class.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DatabaseModule } from './modules/database-setup/database.module';
import { EmailModule } from './modules/email/email.module';
import { FeesModule } from './modules/fees/fees.module';
import { GradeModule } from './modules/grade/grade.module';
import { InviteModule } from './modules/invites/invites.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ParentModule } from './modules/parent/parent.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ResultModule } from './modules/result/result.module';
import { RoomModule } from './modules/room/room.module';
import { SchoolModule } from './modules/school/school.module';
import { SessionModule } from './modules/session/session.module';
import { StreamModule } from './modules/stream/stream.module';
import { StudentModule } from './modules/student/student.module';
import { SubjectModule } from './modules/subject/subject.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { TeachersModule } from './modules/teacher/teacher.module';
import { TeacherSubjectModule } from './modules/teacher-subject/teacher-subject.module';
import { TimetableModule } from './modules/timetable/timetable.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';
@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('env');
        const isProduction = env === 'production';
        const isStaging = env === 'staging';
        const isDevelopment = !isProduction && !isStaging;

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          username: config.get<string>('DB_USER'),
          password: String(config.get<string>('DB_PASS') || 'postgres'),
          database: config.get<string>('DB_NAME'),

          // Auto-load entities from TypeOrmModule.forFeature() in all modules
          autoLoadEntities: true,

          // CRITICAL: Only synchronize in development
          // In production, schema changes MUST go through migrations
          synchronize: isDevelopment,

          // Automatically run pending migrations on application start in production
          migrationsRun: isProduction || isStaging,

          // Migration configuration
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          migrationsTableName: 'migrations',

          // SSL configuration for production databases
          ssl:
            config.get<boolean>('database.ssl') || isProduction
              ? { rejectUnauthorized: false }
              : false,

          // Logging configuration
          logging: isDevelopment ? true : ['error', 'warn', 'migration'],
        };
      },
    }),
    AuthModule,
    UserModule,
    EmailModule,
    SchoolModule,
    SessionModule,
    AuthModule,
    TeachersModule,
    ParentModule,
    ClassModule,
    InviteModule,
    AcademicSessionModule,
    AttendanceModule,
    SubjectModule,
    UploadModule,
    TermModule,
    StreamModule,
    RoomModule,
    StudentModule,
    DashboardModule,
    DatabaseModule,
    TimetableModule,
    TeacherSubjectModule,
    FeesModule,
    GradeModule,
    ResultModule,
    SuperadminModule,
    PaymentModule,
    ResultModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
