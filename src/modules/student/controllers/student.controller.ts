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
  UploadedFile,
  Headers,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';

import { IMulterFile } from '../../../common/types/multer.types';
import { parseBulkCsv } from '../../../common/utils/parse-bulk-csv';
import { pictureUploadConfig } from '../../../config/multer.config';
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
import { StudentGrowthQueryDto } from '../dto/student.growth.dto';
import { PhotoCaptureTokenGuard } from '../guards/photo-capture-token.guard';
import { StudentService } from '../services';
import { StudentBulkImportService } from '../services/student-bulk-import.service';
import { StudentPhotoCaptureService } from '../services/student-photo-capture.service';

@ApiTags(StudentSwagger.tags[0])
@Controller('students')
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly photos: StudentPhotoCaptureService,
    private readonly bulkImport: StudentBulkImportService,
  ) {}

  @Post('bulk-upload/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async validateBulkUpload(@UploadedFile() file: Express.Multer.File) {
    return this.bulkImport.validateClasses(await parseBulkCsv(file));
  }

  @Post('bulk-upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: { id: string },
  ) {
    return this.bulkImport.import(await parseBulkCsv(file), actor.id);
  }

  @Post('me/photo-capture-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  createPhotoCaptureLink(@CurrentUser() user: { id: string }) {
    return this.photos.createLink(user.id);
  }

  @Get('me/photo-capture-links/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  photoCaptureLinkStatus(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.photos.status(user.id, id);
  }

  @Post('photo-capture')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PhotoCaptureTokenGuard)
  @UseInterceptors(FileInterceptor('file', pictureUploadConfig))
  captureStudentPhoto(
    @Headers('x-capture-token') token: string,
    @UploadedFile() file: IMulterFile,
  ) {
    return this.photos.capture(token, file);
  }

  @Get('photo-capture/status')
  @UseGuards(PhotoCaptureTokenGuard)
  photoCaptureTokenStatus() {
    return { valid: true };
  }

  @Post()
  @CreateStudentDocs()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createStudentDto: CreateStudentDto,
    @CurrentUser() actor: { id: string },
  ): Promise<StudentResponseDto> {
    return this.studentService.create(createStudentDto, actor.id);
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
  async getStudentGrowthReport(@Query() query: StudentGrowthQueryDto) {
    return this.studentService.getStudentGrowthReport(query);
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

  @Get('/profile/:studentId/academic-context')
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getAcademicContext(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('session_id', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: IUserPayload,
  ) {
    const data = await this.studentService.getAcademicContext(
      studentId,
      sessionId,
      user,
    );
    return {
      message: 'Student academic context retrieved successfully',
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
    @CurrentUser() actor: { id: string },
  ) {
    return this.studentService.update(id, updateStudentDto, actor.id);
  }

  @DeleteStudentDocs()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
  ) {
    return this.studentService.remove(id, actor.id);
  }

  // report.controller.ts
}
