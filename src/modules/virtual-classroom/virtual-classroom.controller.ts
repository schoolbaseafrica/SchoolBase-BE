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
  UploadedFile,
  UseInterceptors,
  ParseIntPipe,
  StreamableFile,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { SkipWrap } from '../../common/decorators/skip-wrap.decorator';
import { IMulterFile } from '../../common/types/multer.types';
import {
  classroomVoiceNoteConfig,
  pictureUploadConfig,
} from '../../config/multer.config';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { ClassroomCollaborationGateway } from './classroom-collaboration.gateway';
import { ClassroomCollaborationService } from './classroom-collaboration.service';
import {
  CreateVirtualClassroomDto,
  CorrectClassroomAttendanceDto,
  CreateWhiteboardPageDto,
  RenameWhiteboardPageDto,
  ReorderWhiteboardPagesDto,
  SendVirtualClassroomMessageDto,
  UpdateClassroomPermissionsDto,
  UpdateVirtualClassroomStatusDto,
  UpdateWhiteboardSnapshotDto,
} from './virtual-classroom.dto';
import { VirtualClassroomService } from './virtual-classroom.service';

interface IClassroomRequest {
  user: { userId: string; roles?: string[]; role?: string[] };
}

@Controller('virtual-classrooms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
export class VirtualClassroomController {
  constructor(
    private readonly service: VirtualClassroomService,
    private readonly collaboration: ClassroomCollaborationService,
    private readonly collaborationGateway: ClassroomCollaborationGateway,
  ) {}
  private identity(req: IClassroomRequest) {
    return {
      userId: req.user.userId,
      roles: (req.user.roles ?? req.user.role ?? []).map((role) =>
        role.toLowerCase(),
      ),
    };
  }

  @Post() create(
    @Body() dto: CreateVirtualClassroomDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.create(dto, user.userId, user.roles);
  }
  @Get() list(
    @Req() req: IClassroomRequest,
    @Query('session_id') sessionId?: string,
    @Query('term_id') termId?: string,
  ) {
    const user = this.identity(req);
    return this.service.list(user.userId, user.roles, sessionId, termId);
  }
  @Post(':id/join') join(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.join(id, user.userId, user.roles);
  }
  @Post(':id/collaboration-ticket') collaborationTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.collaboration.createTicket(id, user.userId, user.roles);
  }
  @Post(':id/media-token') mediaToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.createMediaToken(id, user.userId, user.roles);
  }
  @Get(':id/whiteboard-pages') whiteboardPages(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service
      .get(id, user.userId, user.roles)
      .then(() => this.collaboration.pages(id));
  }
  @Post(':id/whiteboard-pages')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  async createWhiteboardPage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWhiteboardPageDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    await this.service.get(id, user.userId, user.roles);
    return this.collaboration.createPage(id, dto.title);
  }
  @Patch(':id/whiteboard-pages/:pageKey')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  async renameWhiteboardPage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageKey') pageKey: string,
    @Body() dto: RenameWhiteboardPageDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    await this.service.get(id, user.userId, user.roles);
    return this.collaboration.renamePage(id, pageKey, dto.title);
  }
  @Patch(':id/whiteboard-pages')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  async reorderWhiteboardPages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderWhiteboardPagesDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    await this.service.get(id, user.userId, user.roles);
    return this.collaboration.reorderPages(id, dto.pageKeys);
  }
  @Delete(':id/whiteboard-pages/:pageKey')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  async deleteWhiteboardPage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageKey') pageKey: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    await this.service.get(id, user.userId, user.roles);
    return this.collaboration.deletePage(id, pageKey);
  }
  @Get(':id') detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.get(id, user.userId, user.roles);
  }
  @Patch(':id/status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVirtualClassroomStatusDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.updateStatus(id, dto.status, user.userId, user.roles);
  }
  @Post(':id/heartbeat') heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.heartbeat(id, user.userId, user.roles);
  }
  @Get(':id/participants') participants(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.getParticipants(id, user.userId, user.roles);
  }
  @Get(':id/attendance')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.getAttendanceReview(id, user.userId, user.roles);
  }
  @Patch(':id/attendance/:studentUserId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  correctAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentUserId', ParseUUIDPipe) studentUserId: string,
    @Body() dto: CorrectClassroomAttendanceDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.correctAttendance(
      id,
      studentUserId,
      dto,
      user.userId,
      user.roles,
    );
  }
  @Get(':id/whiteboard') whiteboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.getWhiteboard(id, user.userId, user.roles);
  }
  @Patch(':id/whiteboard') updateWhiteboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWhiteboardSnapshotDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.updateWhiteboard(id, dto, user.userId, user.roles);
  }
  @Post(':id/whiteboard/images')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @UseInterceptors(FileInterceptor('file', pictureUploadConfig))
  uploadWhiteboardImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: IMulterFile,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.uploadWhiteboardImage(
      id,
      file,
      user.userId,
      user.roles,
    );
  }
  @Get(':id/whiteboard/image')
  @SkipWrap()
  async getWhiteboardImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('key') key: string,
    @Req() req: IClassroomRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = this.identity(req);
    const image = await this.service.getWhiteboardImage(
      id,
      key,
      user.userId,
      user.roles,
    );
    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Length', String(image.buffer.length));
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(image.buffer);
  }
  @Delete(':id/whiteboard/legacy')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  retireLegacyWhiteboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.retireLegacyWhiteboard(id, user.userId, user.roles);
  }
  @Post(':id/leave') leave(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    return this.service.leave(id, this.identity(req).userId);
  }
  @Get(':id/messages') messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.getMessages(id, user.userId, user.roles);
  }
  @Post(':id/messages') send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendVirtualClassroomMessageDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.sendMessage(id, dto, user.userId, user.roles);
  }
  @Post(':id/messages/voice')
  @UseInterceptors(FileInterceptor('file', classroomVoiceNoteConfig))
  sendVoiceNote(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: IMulterFile,
    @Body('duration', ParseIntPipe) duration: number,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    return this.service.sendVoiceNote(
      id,
      file,
      duration,
      user.userId,
      user.roles,
    );
  }
  @Get(':id/messages/:messageId/audio')
  @SkipWrap()
  async voiceNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Req() req: IClassroomRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = this.identity(req);
    const audio = await this.service.getVoiceNote(
      id,
      messageId,
      user.userId,
      user.roles,
    );
    response.setHeader('Content-Type', audio.mimeType);
    response.setHeader('Content-Length', String(audio.buffer.length));
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(audio.buffer);
  }
  @Patch(':id/permissions') async permissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassroomPermissionsDto,
    @Req() req: IClassroomRequest,
  ) {
    const user = this.identity(req);
    const room = await this.service.updatePermissions(
      id,
      dto,
      user.userId,
      user.roles,
    );
    if (dto.allowStudentDraw !== undefined)
      this.collaborationGateway.broadcastPermissions(id, dto.allowStudentDraw);
    return room;
  }
}
