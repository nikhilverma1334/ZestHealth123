import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

import * as cookie from 'cookie';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'https://admin.zesthealth.com', 'https://superadmin.zesthealth.com'],
    credentials: true,
  },
})
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.auth?.token || client.handshake.headers['authorization']?.split(' ')[1];
      
      // Extract from httpOnly cookie if present using the cookie package
      if (!token && client.handshake.headers.cookie) {
        const parsedCookies = cookie.parse(client.handshake.headers.cookie);
        if (parsedCookies.jwt_token) {
          token = parsedCookies.jwt_token;
        }
      }

      if (!token) {
        client.disconnect();
        return;
      }
      
      const payload = await this.jwtService.verifyAsync(token, { secret: 'ZestHealthSuperSecretKey_DoNotUseInProd' });
      // Attach the verified payload to the socket
      (client as any).user = payload;

      // Force socket disconnect when JWT expires to enforce revocation SLA
      if (payload.exp) {
        const timeUntilExpiry = (payload.exp * 1000) - Date.now();
        if (timeUntilExpiry <= 0) {
          client.disconnect();
          return;
        }

        const PRE_EXPIRY_WINDOW = 60 * 1000; // 60 seconds
        if (timeUntilExpiry > PRE_EXPIRY_WINDOW) {
          setTimeout(() => {
            client.emit('token_expiring', { message: 'Token expires in 60s. Proactively refresh and reconnect.' });
          }, timeUntilExpiry - PRE_EXPIRY_WINDOW);
        } else {
          // If less than 60s remaining at connection time, emit immediately
          client.emit('token_expiring', { message: 'Token expires soon. Proactively refresh and reconnect.' });
        }

        setTimeout(() => {
          client.disconnect();
        }, timeUntilExpiry);
      }

      if (payload.role === 'PATIENT') {
        // Patients automatically join a room exclusively for their own patientId
        client.join(`patient_${payload.sub}`);
      }
      
    } catch (err) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Rooms are automatically left upon disconnect
  }

  @SubscribeMessage('subscribe_queue')
  handleSubscribeQueue(@ConnectedSocket() client: Socket, @MessageBody() data: { tenantId: string, branchId?: string }) {
    const user = (client as any).user;
    if (!user) return;
    
    let hasAccess = user.role === 'PLATFORM_SUPER_ADMIN';
    
    if (!hasAccess && user.roles) {
      hasAccess = user.roles.some((r: any) => {
        // Must match tenant
        if (r.tenantId !== data.tenantId) return false;
        // If they are HOSPITAL_ADMIN, they can access all branches in the tenant
        if (r.role === 'HOSPITAL_ADMIN') return true;
        // If they are BRANCH_RECEPTION or DOCTOR, they must match the branch
        if (data.branchId && r.branchId !== data.branchId) return false;
        return true;
      });
    }
    
    if (hasAccess) {
      const room = data.branchId ? `queue_${data.tenantId}_${data.branchId}` : `queue_${data.tenantId}`;
      client.join(room);
    } else {
      client.emit('error', 'Unauthorized to subscribe to this queue');
    }
  }

  notifyPatient(patientId: string, payload: any) {
    this.server.to(`patient_${patientId}`).emit('queue_update', payload);
  }

  notifyTenantStaff(tenantId: string, branchId: string, payload: any) {
    this.server.to(`queue_${tenantId}`).to(`queue_${tenantId}_${branchId}`).emit('queue_update', payload);
  }
}
