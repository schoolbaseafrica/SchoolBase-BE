import {
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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { SkipWrap } from '../../common/decorators/skip-wrap.decorator';
import { IMulterFile } from '../../common/types/multer.types';
import { assignmentAttachmentConfig } from '../../config/multer.config';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  SaveSubmissionDto,
  TransitionAssignmentDto,
  UpdateAssignmentDto,
} from './assignment.dto';
import { AssignmentService } from './assignment.service';

interface IAssignmentRequest {
  user: { userId?: string; id?: string; roles?: string[]; role?: string[] };
}

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}
  private user(req: IAssignmentRequest) {
    return {
      id: req.user.userId ?? req.user.id!,
      roles: (req.user.roles ?? req.user.role ?? []).map((role) =>
        role.toLowerCase(),
      ),
    };
  }

  @Get() list(
    @Req() req: IAssignmentRequest,
    @Query('session_id') sessionId?: string,
    @Query('term_id') termId?: string,
    @Query('include_archived') includeArchived?: string,
  ) {
    const user = this.user(req);
    return this.service.list(
      user.id,
      user.roles,
      sessionId,
      termId,
      includeArchived === 'true',
    );
  }

  @Get('options/subjects')
  @Roles(UserRole.TEACHER)
  teacherSubjects(
    @Query('class_id', ParseUUIDPipe) classId: string,
    @Req() req: IAssignmentRequest,
  ) {
    return this.service.teacherSubjects(classId, this.user(req).id);
  }

  @Get(':id/attachments')
  attachments(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    return this.service.listAttachments(id, user.id, user.roles);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', assignmentAttachmentConfig))
  uploadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: IMulterFile,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    return this.service.uploadAttachment(id, file, user.id, user.roles);
  }

  @Get(':id/attachments/:attachmentId/download')
  @SkipWrap()
  async downloadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: IAssignmentRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = this.user(req);
    const { attachment, buffer } = await this.service.downloadAttachment(
      id,
      attachmentId,
      user.id,
      user.roles,
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    return new StreamableFile(buffer);
  }

  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    await this.service.deleteAttachment(id, attachmentId, user.id, user.roles);
    return { deleted: true };
  }

  @Get(':id') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    return this.service.get(id, user.id, user.roles);
  }

  @Post()
  @Roles(UserRole.TEACHER)
  create(@Body() dto: CreateAssignmentDto, @Req() req: IAssignmentRequest) {
    const user = this.user(req);
    return this.service.create(dto, user.id, user.roles);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    return this.service.update(id, dto, user.id, user.roles);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionAssignmentDto,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    return this.service.transition(id, dto.status, user.id, user.roles);
  }

  @Post(':id/submission')
  @Roles(UserRole.STUDENT)
  saveSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSubmissionDto,
    @Req() req: IAssignmentRequest,
  ) {
    return this.service.saveSubmission(id, dto, this.user(req).id);
  }

  @Patch(':id/submissions/:submissionId/grade')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  grade(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: GradeSubmissionDto,
    @Req() req: IAssignmentRequest,
  ) {
    const user = this.user(req);
    return this.service.grade(id, submissionId, dto, user.id, user.roles);
  }
}
