import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`🔌 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_tenant')
  handleJoinTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantId: string },
  ) {
    if (data.tenantId) {
      client.join(`tenant:${data.tenantId}`);
      console.log(`🏢 Client ${client.id} joined room: tenant:${data.tenantId}`);
      return { status: 'joined', room: `tenant:${data.tenantId}` };
    }
  }

  /** Broadcast stock update event to specific tenant room */
  notifyStockUpdate(tenantId: string, payload: any) {
    this.server.to(`tenant:${tenantId}`).emit('stock_updated', payload);
  }

  /** Broadcast notification event to specific tenant room */
  notifyTenant(tenantId: string, event: string, payload: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }
}
