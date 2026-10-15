import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';

import { IRequestWithUser } from '../../common/types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import {
  AddScheduleDocs,
  EditScheduleDocs,
  GetAllTimetableDocs,
  GetTimetableDocs,
  UnassignRoomDocs,
} from './docs';
import {
  AddScheduleDto,
  GetTimetableResponseDto,
  UpdateScheduleDto,
} from './dto/timetable.dto';
import { DayOfWeek } from './enums/timetable.enums';
import { TimetableService } from './timetable.service';

@ApiTags('Timetables')
@Controller('timetables')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @ApiExcludeEndpoint()
  @Post()
  create() {
    return this.timetableService.create();
  }

  @Post('schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @AddScheduleDocs()
  addSchedule(@Body() dto: AddScheduleDto, @Req() req: IRequestWithUser) {
    return this.timetableService.addSchedule(dto, req.user);
  }

  @Put('schedule/:schedule_id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @EditScheduleDocs()
  editSchedule(
    @Param('schedule_id') scheduleId: string,
    @Body() dto: UpdateScheduleDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.timetableService.editSchedule(scheduleId, dto, req.user);
  }

  @Patch('schedule/:schedule_id/unassign-room')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UnassignRoomDocs()
  unassignRoom(@Param('schedule_id') scheduleId: string) {
    return this.timetableService.unassignRoom(scheduleId);
  }

  @Get('view-time-table')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.TEACHER)
  @GetAllTimetableDocs()
  getAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('day') day?: DayOfWeek,
  ) {
    return this.timetableService.getAll(page, limit, day);
  }

  @Get('class/:classId')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  @GetTimetableDocs()
  findByClass(
    @Param('classId') classId: string,
  ): Promise<GetTimetableResponseDto> {
    return this.timetableService.findByClass(classId);
  }

  @Get('class/:classId/options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  getClassScheduleOptions(
    @Param('classId') classId: string,
    @Req() req: IRequestWithUser,
  ) {
    return this.timetableService.getClassScheduleOptions(classId, req.user);
  }

  @ApiExcludeEndpoint()
  @Get('teacher/:teacher_id')
  findByTeacher() {
    return this.timetableService.findByTeacher();
  }

  @ApiExcludeEndpoint()
  @Get(':id')
  findOne() {
    return this.timetableService.findOne();
  }

  @ApiExcludeEndpoint()
  @Patch(':id')
  update() {
    return this.timetableService.update();
  }

  @ApiExcludeEndpoint()
  @Patch(':id/archive')
  archive() {
    return this.timetableService.archive();
  }

  @ApiExcludeEndpoint()
  @Delete(':id')
  remove() {
    return this.timetableService.remove();
  }
}
