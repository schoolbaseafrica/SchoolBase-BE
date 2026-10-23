import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import {
  CreateMeetingDto,
  MeetingAdmissionDto,
  MeetingStatusDto,
} from './meeting.dto';
import { MeetingService } from './meeting.service';

type RequestUser = { user: { userId: string; roles: string[] } };

@Controller('meetings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT)
export class MeetingController {
  constructor(private readonly service: MeetingService) {}
  @Get() list(@Req() req: RequestUser) {
    return this.service.list(req.user.userId, req.user.roles);
  }
  @Post() @Roles(UserRole.ADMIN) create(
    @Body() dto: CreateMeetingDto,
    @Req() req: RequestUser,
  ) {
    return this.service.create(dto, req.user.userId);
  }
  @Get('invitees') @Roles(UserRole.ADMIN) invitees(@Query('q') query = '') {
    return this.service.invitees(query);
  }
  @Get(':id') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestUser,
  ) {
    return this.service.get(id, req.user.userId, req.user.roles);
  }
  @Patch(':id/status') @Roles(UserRole.ADMIN) status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MeetingStatusDto,
    @Req() req: RequestUser,
  ) {
    return this.service.setStatus(id, dto.status, req.user.userId);
  }
  @Post(':id/media-token') token(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestUser,
  ) {
    return this.service.mediaToken(id, req.user.userId, req.user.roles);
  }
  @Post(':id/admission') admission(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestUser,
  ) {
    return this.service.requestAdmission(id, req.user.userId, req.user.roles);
  }
  @Get(':id/admission') admissionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestUser,
  ) {
    return this.service.admissionStatus(id, req.user.userId, req.user.roles);
  }
  @Patch(':id/admission/:userId')
  @Roles(UserRole.ADMIN)
  decideAdmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: MeetingAdmissionDto,
    @Req() req: RequestUser,
  ) {
    return this.service.decideAdmission(
      id,
      userId,
      dto.status,
      req.user.userId,
    );
  }
  @Post(':id/participants/:userId/mute')
  @Roles(UserRole.ADMIN)
  mute(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: RequestUser,
  ) {
    return this.service.muteParticipant(id, userId, req.user.userId);
  }
}
