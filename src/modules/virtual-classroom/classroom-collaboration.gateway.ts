import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';

import {
  ClassroomCollaborationService,
  ICollaborationTicket,
} from './classroom-collaboration.service';

interface ICollaborationSocket extends Socket {
  data: { identity?: ICollaborationTicket; pageKey?: string };
}

@WebSocketGateway({
  namespace: '/classroom-collaboration',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class ClassroomCollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Namespace;
  private readonly logger = new Logger(ClassroomCollaborationGateway.name);

  constructor(private readonly collaboration: ClassroomCollaborationService) {}

  async handleConnection(client: ICollaborationSocket) {
    try {
      const ticket = String(client.handshake.auth?.ticket ?? '');
      const identity = await this.collaboration.verifyTicket(ticket);
      client.data.identity = identity;
      await client.join(`classroom:${identity.classroomId}`);
      client.emit('permissions', {
        allowStudentDraw: identity.allowStudentDraw,
      });
      client.emit(
        'presence-snapshot',
        [...this.server.sockets.values()]
          .filter(
            (socket: ICollaborationSocket) =>
              socket.data.identity?.classroomId === identity.classroomId,
          )
          .map((socket: ICollaborationSocket) => ({
            userId: socket.data.identity!.sub,
            name: socket.data.identity!.name,
            roles: socket.data.identity!.roles,
            socketId: socket.id,
          })),
      );
      this.server.to(`classroom:${identity.classroomId}`).emit('presence', {
        type: 'joined',
        userId: identity.sub,
        name: identity.name,
        roles: identity.roles,
        socketId: client.id,
      });
    } catch {
      this.logger.warn(`Rejected collaboration socket ${client.id}`);
      client.emit('collaboration-error', {
        message: 'Collaboration authorization failed',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ICollaborationSocket) {
    const identity = client.data.identity;
    if (identity)
      this.server.to(`classroom:${identity.classroomId}`).emit('presence', {
        type: 'left',
        userId: identity.sub,
        socketId: client.id,
      });
  }

  @SubscribeMessage('sync')
  async sync(
    @ConnectedSocket() client: ICollaborationSocket,
    @MessageBody() body: { pageKey?: string; sinceSequence?: number },
  ) {
    const identity = this.identity(client);
    const pageKey = body.pageKey ?? 'main';
    if (client.data.pageKey && client.data.pageKey !== pageKey)
      await client.leave(
        `classroom:${identity.classroomId}:page:${client.data.pageKey}`,
      );
    client.data.pageKey = pageKey;
    await client.join(`classroom:${identity.classroomId}:page:${pageKey}`);
    return this.collaboration.sync(
      identity.classroomId,
      pageKey,
      Math.max(0, Number(body.sinceSequence ?? 0)),
    );
  }

  @SubscribeMessage('whiteboard-update')
  async update(
    @ConnectedSocket() client: ICollaborationSocket,
    @MessageBody() body: { pageKey?: string; update?: string },
  ) {
    const identity = this.identity(client);
    if (
      !(await this.collaboration.canWrite(
        identity.classroomId,
        identity.sub,
        identity.roles,
      ))
    )
      throw new WsException('Drawing is disabled');
    const pageKey = body.pageKey ?? client.data.pageKey ?? 'main';
    const result = await this.collaboration.appendUpdate(
      identity.classroomId,
      pageKey,
      String(body.update ?? ''),
      identity.sub,
    );
    client
      .to(`classroom:${identity.classroomId}:page:${pageKey}`)
      .emit('whiteboard-update', result);
    return { sequence: result.sequence };
  }

  @SubscribeMessage('awareness')
  awareness(
    @ConnectedSocket() client: ICollaborationSocket,
    @MessageBody() body: { pageKey?: string; state?: unknown },
  ) {
    const identity = this.identity(client);
    const pageKey = body.pageKey ?? client.data.pageKey ?? 'main';
    client
      .to(`classroom:${identity.classroomId}:page:${pageKey}`)
      .emit('awareness', {
        userId: identity.sub,
        socketId: client.id,
        state: body.state ?? null,
      });
  }

  broadcastPermissions(classroomId: string, allowStudentDraw: boolean) {
    this.server.to(`classroom:${classroomId}`).emit('permissions', {
      allowStudentDraw,
    });
  }

  private identity(client: ICollaborationSocket) {
    if (!client.data.identity) throw new WsException('Unauthorized');
    return client.data.identity;
  }
}
