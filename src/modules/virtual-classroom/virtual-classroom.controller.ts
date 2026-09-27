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
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { ClassroomCollaborationGateway } from './classroom-collaboration.gateway';
import { ClassroomCollaborationService } from './classroom-collaboration.service';
import {
  CreateVirtualClassroomDto,
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
