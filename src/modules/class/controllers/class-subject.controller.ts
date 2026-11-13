import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  UseGuards,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsUUID } from 'class-validator';

import { IRequestWithUser } from '../../../common/types';
import * as sysMsg from '../../../constants/system.messages';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../shared/enums';
import {
  ClassSubjectSwagger,
  DocsListClassSubjects,
  DocsAssignTeacherToSubject,
  DocsUnassignTeacherFromSubject,
  DocsCreateClassSubjects,
} from '../docs';
import {
  AssignTeacherToClassSubjectRequestDto,
  BulkCreateClassSubjectRequestDto,
  ListClassSubjectQueryDto,
} from '../dto';
import { ClassSubjectService } from '../services';
import { StudentSubjectEnrollmentService } from '../services/student-subject-enrollment.service';

class SetElectiveDto {
  @IsBoolean()
  is_elective: boolean;
}

class ReplaceElectiveStudentsDto {
  @IsUUID()
  term_id: string;

  @IsArray()
  @IsUUID('4', { each: true })
  student_ids: string[];
}

@ApiTags(ClassSubjectSwagger.tags[0])
@Controller('class-subjects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassSubjectController {
  constructor(
    private readonly service: ClassSubjectService,
    private readonly enrollmentService: StudentSubjectEnrollmentService,
  ) {}

  @Patch(':id/elective')
  @Roles(UserRole.ADMIN)
  setElective(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetElectiveDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.enrollmentService.setElective(
      id,
      dto.is_elective,
      req.user.userId,
    );
  }

  @Get(':id/enrollments')
  @Roles(UserRole.ADMIN)
  getEnrollments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('term_id', ParseUUIDPipe) termId: string,
  ) {
    return this.enrollmentService.getEnrollment(id, termId);
  }

  @Patch(':id/enrollments')
  @Roles(UserRole.ADMIN)
  replaceEnrollments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceElectiveStudentsDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.enrollmentService.replaceEnrollment(
      id,
      dto.term_id,
      dto.student_ids,
      req.user.userId,
    );
  }

  // --- POST: CREATE CLASS SUBJECTS ---
  @Post()
  @Roles(UserRole.ADMIN)
  @DocsCreateClassSubjects()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() { classId, subjectIds }: BulkCreateClassSubjectRequestDto) {
    return this.service.create(classId, subjectIds);
  }

  // --- GET: LIST CLASS SUBJECTS ---
  @Get()
  @DocsListClassSubjects()
  async list(
    @Req() req: IRequestWithUser,
    @Query() query: ListClassSubjectQueryDto,
  ) {
    if (req.user.roles.includes(UserRole.TEACHER)) {
      const teacherId = req.user.teacher_id;
      if (!teacherId) {
        throw new BadRequestException(sysMsg.TEACHER_PROFILE_NOT_FOUND);
      }
      query.teacher_id = teacherId;
    }
    return this.service.list(query);
  }

  // --- POST: ASSIGN TEACHER TO CLASS SUBJECT ---
  @Roles(UserRole.ADMIN)
  @Post(':id/teacher')
  @DocsAssignTeacherToSubject()
  async assignTeacher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { teacherId }: AssignTeacherToClassSubjectRequestDto,
  ) {
    return this.service.assignTeacher(id, teacherId);
  }

  // --- DELETE: DELETE TEACHER FROM CLASS SUBJECT ---
  @Roles(UserRole.ADMIN)
  @DocsUnassignTeacherFromSubject()
  @Delete(':id/teacher')
  @DocsAssignTeacherToSubject()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassignTeacher(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.unassignTeacher(id);
  }
}
