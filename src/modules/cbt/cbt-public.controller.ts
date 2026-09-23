import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CbtService } from './cbt.service';
import {
  RecordCbtIntegrityEventDto,
  SaveCbtAnswerDto,
  StartPublicCbtAttemptDto,
} from './dto';
import { CbtAttemptEventType } from './entities';

@ApiTags('Public CBT')
@Controller('public/cbt')
export class CbtPublicController {
  constructor(private readonly cbtService: CbtService) {}

  @Get('exams')
  listExams() {
    return this.cbtService.listPublicExams();
  }

  @Get('exams/:examId')
  getExam(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.cbtService.getPublicExam(examId);
  }

  @Post('exams/:examId/attempts')
  startAttempt(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: StartPublicCbtAttemptDto,
  ) {
    return this.cbtService.startPublicAttempt(examId, dto);
  }

  @Get('attempts/:attemptId')
  getAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-cbt-access-token') accessToken: string,
  ) {
    return this.cbtService.getPublicAttempt(attemptId, accessToken);
  }

  @Patch('attempts/:attemptId/answers/:questionId')
  saveAnswer(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Headers('x-cbt-access-token') accessToken: string,
    @Body() dto: SaveCbtAnswerDto,
  ) {
    return this.cbtService.savePublicAnswer(
      attemptId,
      questionId,
      accessToken,
      dto,
    );
  }

  @Post('attempts/:attemptId/events')
  recordEvent(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-cbt-access-token') accessToken: string,
    @Body() dto: RecordCbtIntegrityEventDto,
  ) {
    return this.cbtService.recordPublicEvent(
      attemptId,
      accessToken,
      dto.eventType as CbtAttemptEventType,
      dto.metadata,
    );
  }

  @Post('attempts/:attemptId/submit')
  submitAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-cbt-access-token') accessToken: string,
  ) {
    return this.cbtService.submitPublicAttempt(attemptId, accessToken);
  }
}
