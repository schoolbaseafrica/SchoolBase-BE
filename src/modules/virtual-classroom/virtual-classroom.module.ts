import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  VirtualClassroomMessage,
  VirtualClassroomParticipant,
  VirtualClassroomSession,
} from './entities/virtual-classroom.entity';
import { VirtualClassroomController } from './virtual-classroom.controller';
import { VirtualClassroomService } from './virtual-classroom.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VirtualClassroomSession,
      VirtualClassroomParticipant,
      VirtualClassroomMessage,
    ]),
  ],
  controllers: [VirtualClassroomController],
  providers: [VirtualClassroomService],
})
export class VirtualClassroomModule {}
