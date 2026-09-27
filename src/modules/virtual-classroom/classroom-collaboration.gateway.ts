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
      this.server.to(`classroom:${identity.classroomId}`).emit('presence', {
        type: 'joined',
        userId: identity.sub,
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
    if (!identity.canWrite) throw new WsException('Drawing is disabled');
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

  private identity(client: ICollaborationSocket) {
    if (!client.data.identity) throw new WsException('Unauthorized');
    return client.data.identity;
  }
}
