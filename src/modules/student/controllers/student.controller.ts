import {
  Controller,
  Get,
  Param,
  Delete,
  Post,
  Body,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { IUserPayload } from '../../parent/parent.service';
import { UserRole } from '../../shared/enums';
import {
  StudentSwagger,
  CreateStudentDocs,
  GetStudentDocs,
  ListStudentsDocs,
  UpdateStudentDocs,
  DeleteStudentDocs,
  studentGrowthDecorator,
} from '../docs';
import { GetStudentProfileDocs } from '../docs/get-student-profile.docs';
import {
  CreateStudentDto,
  ListStudentsDto,
  StudentResponseDto,
  PatchStudentDto,
  StudentProfileResponseDto,
} from '../dto';
import { StudentService } from '../services';

@ApiTags(StudentSwagger.tags[0])
@Controller('students')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Post()
  @CreateStudentDocs()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createStudentDto: CreateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.studentService.create(createStudentDto);
  }

  // --- GET: LIST ALL STUDENTS (with pagination and search) ---
  @Get()
  @ListStudentsDocs()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  findAll(@Query() listStudentsDto: ListStudentsDto) {
    return this.studentService.findAll(listStudentsDto);
  }

  // ----get student growth ----
  @studentGrowthDecorator()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('student-growth-report')
  async getStudentGrowthReport(@Query('academic_year') academicYear: string) {
    return this.studentService.getStudentGrowthReport(academicYear);
  }

  // --- GET: GET LOGGED-IN STUDENT'S PROFILE ---
  @Get('/profile/:studentId')
  @GetStudentProfileDocs()
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({ description: sysMsg.PROFILE_RETRIEVED })
  async getMyProfile(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: IUserPayload,
  ): Promise<{
    message: string;
    status_code: number;
    data: StudentProfileResponseDto;
  }> {
    const data = await this.studentService.getMyProfile(studentId, user);
    return {
      message: sysMsg.PROFILE_RETRIEVED,
      status_code: HttpStatus.OK,
      data,
    };
  }

  // --- GET: GET SINGLE STUDENT BY ID ---
  @Get(':id')
  @GetStudentDocs()
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  findOne(@Param('id') id: string) {
    return this.studentService.findOne(id);
  }

  @UpdateStudentDocs()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStudentDto: PatchStudentDto,
  ) {
    return this.studentService.update(id, updateStudentDto);
  }

  @DeleteStudentDocs()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.remove(id);
  }

  // report.controller.ts
}
