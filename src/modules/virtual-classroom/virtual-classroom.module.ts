import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UploadModule } from '../upload/upload.module';

import { ClassroomCollaborationGateway } from './classroom-collaboration.gateway';
import { ClassroomCollaborationService } from './classroom-collaboration.service';
import {
  VirtualClassroomMessage,
  VirtualClassroomParticipant,
  VirtualClassroomSession,
  VirtualClassroomAttendanceEvent,
  VirtualClassroomAttendanceAdjustment,
  VirtualClassroomHealthEvent,
} from './entities/virtual-classroom.entity';
import { VirtualClassroomController } from './virtual-classroom.controller';
import { VirtualClassroomService } from './virtual-classroom.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('jwt.secret') || config.get<string>('JWT_SECRET'),
      }),
    }),
    TypeOrmModule.forFeature([
      VirtualClassroomSession,
      VirtualClassroomParticipant,
      VirtualClassroomMessage,
      VirtualClassroomAttendanceEvent,
      VirtualClassroomAttendanceAdjustment,
      VirtualClassroomHealthEvent,
    ]),
    UploadModule,
  ],
  controllers: [VirtualClassroomController],
  providers: [
    VirtualClassroomService,
    ClassroomCollaborationService,
    ClassroomCollaborationGateway,
  ],
})
export class VirtualClassroomModule {}
