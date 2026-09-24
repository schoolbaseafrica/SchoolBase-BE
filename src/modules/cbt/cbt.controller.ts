import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { CbtService } from './cbt.service';
import {
  CreateCbtBankQuestionDto,
  CreateCbtExamDto,
  CreateCbtQuestionDto,
  CreateCbtSectionDto,
  GradeCbtAnswerDto,
  ImportCbtBankQuestionDto,
  ListCbtExamsDto,
  ListCbtApplicantsDto,
  ListCbtQuestionBankDto,
  RecordCbtConnectionEventDto,
  SaveCbtAnswerDto,
  TransitionCbtExamDto,
  UpdateCbtExamDto,
  UpdateCbtQuestionDto,
  UpdateCbtSectionDto,
} from './dto';
import { CbtAttemptEventType } from './entities';

interface ICbtRequestUser {
  userId: string;
  student_id?: string;
}

interface ICbtRequest extends Request {
  user: ICbtRequestUser;
}

@ApiTags('CBT')
@ApiBearerAuth()
@Controller('cbt')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CbtController {
  constructor(private readonly cbtService: CbtService) {}

  @Post('exams')
  @Roles(UserRole.ADMIN)
  createExam(@Body() dto: CreateCbtExamDto, @Req() request: ICbtRequest) {
    return this.cbtService.createExam(dto, request.user.userId);
  }

  @Get('exams')
  @Roles(UserRole.ADMIN)
  listExams(@Query() query: ListCbtExamsDto) {
    return this.cbtService.listExams(query);
  }

  @Get('applicants')
  @Roles(UserRole.ADMIN)
  listApplicants(@Query() query: ListCbtApplicantsDto) {
    return this.cbtService.listApplicants(query);
  }

  @Get('applicants/:applicantId')
  @Roles(UserRole.ADMIN)
  getApplicant(
    @Param('applicantId', ParseUUIDPipe) applicantId: string,
    @Query() query: ListCbtApplicantsDto,
  ) {
    return this.cbtService.getApplicant(applicantId, query);
  }

  @Post('applicants/:applicantId/admit')
  @Roles(UserRole.ADMIN)
  admitApplicant(
    @Param('applicantId', ParseUUIDPipe) applicantId: string,
    @Query() query: ListCbtApplicantsDto,
  ) {
    return this.cbtService.admitApplicant(applicantId, query);
  }

  @Get('exams/:examId')
  @Roles(UserRole.ADMIN)
  getExam(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.cbtService.getExamForManagement(examId);
  }

  @Get('exams/:examId/attempts')
  @Roles(UserRole.ADMIN)
  getExamAttempts(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.cbtService.getExamAttempts(examId);
  }

  @Get('question-bank')
  @Roles(UserRole.ADMIN)
  listQuestionBank(@Query() query: ListCbtQuestionBankDto) {
    return this.cbtService.listQuestionBank(query);
  }

  @Post('question-bank')
  @Roles(UserRole.ADMIN)
  createBankQuestion(@Body() dto: CreateCbtBankQuestionDto) {
    return this.cbtService.createBankQuestion(dto);
  }

  @Post('questions/:questionId/save-to-bank')
  @Roles(UserRole.ADMIN)
  saveQuestionToBank(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.cbtService.saveQuestionToBank(questionId);
  }

  @Get('attempts/:attemptId/review')
  @Roles(UserRole.ADMIN)
  getAttemptReview(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.cbtService.getAttemptReview(attemptId);
  }

  @Patch('attempt-events/:eventId/acknowledge')
  @Roles(UserRole.ADMIN)
  acknowledgeAttemptEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.acknowledgeAttemptEvent(
      eventId,
      request.user.userId,
    );
  }

  @Patch('attempts/:attemptId/answers/:questionId/grade')
  @Roles(UserRole.ADMIN)
  gradeAttemptAnswer(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: GradeCbtAnswerDto,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.gradeAttemptAnswer(
      attemptId,
      questionId,
      dto,
      request.user.userId,
    );
  }

  @Post('attempts/:attemptId/publish-result')
  @Roles(UserRole.ADMIN)
  publishAttemptResult(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.publishAttemptResult(attemptId, request.user.userId);
  }

  @Patch('exams/:examId')
  @Roles(UserRole.ADMIN)
  updateExam(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: UpdateCbtExamDto,
  ) {
    return this.cbtService.updateExam(examId, dto);
  }

  @Post('exams/:examId/questions')
  @Roles(UserRole.ADMIN)
  addQuestion(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: CreateCbtQuestionDto,
  ) {
    return this.cbtService.addQuestion(examId, dto);
  }

  @Post('exams/:examId/questions/import/:questionId')
  @Roles(UserRole.ADMIN)
  importBankQuestion(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: ImportCbtBankQuestionDto,
  ) {
    return this.cbtService.importBankQuestion(examId, questionId, dto);
  }

  @Post('exams/:examId/sections')
  @Roles(UserRole.ADMIN)
  createSection(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: CreateCbtSectionDto,
  ) {
    return this.cbtService.createSection(examId, dto);
  }

  @Patch('sections/:sectionId')
  @Roles(UserRole.ADMIN)
  updateSection(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateCbtSectionDto,
  ) {
    return this.cbtService.updateSection(sectionId, dto);
  }

  @Delete('sections/:sectionId')
  @Roles(UserRole.ADMIN)
  deleteSection(@Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.cbtService.deleteSection(sectionId);
  }

  @Patch('questions/:questionId')
  @Roles(UserRole.ADMIN)
  updateQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: UpdateCbtQuestionDto,
  ) {
    return this.cbtService.updateQuestion(questionId, dto);
  }

  @Post('exams/:examId/publish')
  @Roles(UserRole.ADMIN)
  publishExam(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.cbtService.publishExam(examId);
  }

  @Patch('exams/:examId/status')
  @Roles(UserRole.ADMIN)
  transitionExam(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: TransitionCbtExamDto,
  ) {
    return this.cbtService.transitionExam(examId, dto);
  }

  @Get('student/exams')
  @Roles(UserRole.STUDENT)
  listStudentExams(
    @Req() request: ICbtRequest,
    @Query() query: ListCbtApplicantsDto,
  ) {
    return this.cbtService.listStudentExams(this.studentId(request), query);
  }

  @Post('student/exams/:examId/attempts')
  @Roles(UserRole.STUDENT)
  startAttempt(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.startOrResumeAttempt(
      examId,
      this.studentId(request),
    );
  }

  @Get('student/attempts/:attemptId')
  @Roles(UserRole.STUDENT)
  getAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.getAttempt(attemptId, this.studentId(request));
  }

  @Patch('student/attempts/:attemptId/answers/:questionId')
  @Roles(UserRole.STUDENT)
  saveAnswer(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SaveCbtAnswerDto,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.saveAnswer(
      attemptId,
      questionId,
      this.studentId(request),
      dto,
    );
  }

  @Post('student/attempts/:attemptId/connection-events')
  @Roles(UserRole.STUDENT)
  recordConnectionEvent(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: RecordCbtConnectionEventDto,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.recordConnectionEvent(
      attemptId,
      this.studentId(request),
      dto.eventType as
        | CbtAttemptEventType.CONNECTION_LOST
        | CbtAttemptEventType.CONNECTION_RESTORED,
      dto.metadata,
    );
  }

  @Post('student/attempts/:attemptId/submit')
  @Roles(UserRole.STUDENT)
  submitAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Req() request: ICbtRequest,
  ) {
    return this.cbtService.submitAttempt(attemptId, this.studentId(request));
  }

  private studentId(request: ICbtRequest) {
    if (!request.user.student_id) {
      throw new BadRequestException('Student profile not found');
    }
    return request.user.student_id;
  }
}
