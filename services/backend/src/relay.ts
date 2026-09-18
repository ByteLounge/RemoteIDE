import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { DatabaseSync } from 'node:sqlite';
import { AuthService } from './auth';
import { createLogger } from '@remotedev/shared-utils';
import { parseProtocolMessage, ProtocolEnvelope, createEnvelope, createErrorEnvelope } from '@remotedev/protocol';
import { SyncOperation } from '@remotedev/types';

const logger = createLogger('RelayServer');

interface ConnectedClient {
  ws: WebSocket;
  deviceId: string;
  userId: string;
  deviceType: string;
  connectedAt: number;
}

export class RelayServer {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map(); // deviceId -> ConnectedClient

  constructor(server: any, private db: DatabaseSync, private authService: AuthService) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupServer();
    logger.info('WebSocket relay server initialized on path /ws');
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      let registeredDeviceId: string | null = null;
      let registeredUserId: string | null = null;

      logger.info(`New WebSocket client connected from ${req.socket.remoteAddress}`);

      ws.on('message', (data: Buffer | string) => {
        try {
          const rawStr = data.toString('utf8');
          const envelope = parseProtocolMessage(rawStr);

          // Handle Authentication / Handshake
          if (envelope.type === 'auth.handshake') {
            const payload = envelope.payload as any;
            const token = payload?.token;
            const deviceId = payload?.deviceId || `dev_${Date.now()}`;
            const deviceType = payload?.deviceType || 'UNKNOWN';

            let userId = 'user_dev_001';
            if (token) {
              const verifiedId = this.authService.verifyToken(token);
              if (verifiedId) userId = verifiedId;
            }

            registeredDeviceId = deviceId;
            registeredUserId = userId;

            this.clients.set(deviceId, {
              ws,
              deviceId,
              userId,
              deviceType,
              connectedAt: Date.now(),
            });

            // Mark device online in DB
            try {
              this.db.prepare('UPDATE devices SET is_online = 1, last_seen_at = ? WHERE id = ?').run(Date.now(), deviceId);
            } catch {}

            // Send handshake confirmation
            const response = createEnvelope('auth.handshake.response', {
              authenticated: true,
              sessionId: `sess_${Date.now()}`,
              deviceId,
              topology: 'RELAY',
            }, { requestId: envelope.id });

            ws.send(JSON.stringify(response));
            logger.info(`Device registered: ${deviceId} (${deviceType}) for user ${userId}`);

            // Broadcast device presence to other devices for this user
            this.broadcastDevicePresence(userId, deviceId, true);

            // If laptop connected, check for queued pending sync operations
            if (deviceType === 'WINDOWS_LAPTOP') {
              this.flushPendingOperationsToLaptop(deviceId, ws);
            }
            return;
          }

          // Handle Heartbeat Ping
          if (envelope.type === 'ping') {
            ws.send(JSON.stringify(createEnvelope('pong', { time: Date.now() }, { requestId: envelope.id })));
            return;
          }

          // Message Routing
          if (envelope.target) {
            const targetClient = this.clients.get(envelope.target);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
              // Target is online: forward frame
              targetClient.ws.send(rawStr);
              logger.debug(`Relayed message ${envelope.type} from ${envelope.source} to ${envelope.target}`);
            } else {
              // Target is offline!
              logger.warn(`Target device ${envelope.target} is offline`);

              // Special offline behavior: buffer push_operations in DB
              if (envelope.type === 'sync.push_operations') {
                this.bufferOfflineOperations(envelope);
                const ack = createEnvelope('sync.push_operations.response', {
                  buffered: true,
                  status: 'QUEUED_IN_CLOUD',
                  acceptedOperationIds: (envelope.payload as any)?.operations?.map((o: any) => o.operation_id) || [],
                }, { requestId: envelope.id });
                ws.send(JSON.stringify(ack));
              } else {
                // Return offline error envelope
                ws.send(JSON.stringify(createErrorEnvelope(
                  envelope.id,
                  'INTERNAL_ERROR',
                  `Target device ${envelope.target} is currently offline.`
                )));
              }
            }
          } else {
            // Broadcast or local agent handling
            logger.debug(`Unhandled or non-targeted message: ${envelope.type}`);
          }
        } catch (err: any) {
          logger.error('Error handling WebSocket message', err);
        }
      });

      ws.on('close', () => {
        if (registeredDeviceId) {
          this.clients.delete(registeredDeviceId);
          logger.info(`Device disconnected: ${registeredDeviceId}`);

          try {
            this.db.prepare('UPDATE devices SET is_online = 0, last_seen_at = ? WHERE id = ?').run(Date.now(), registeredDeviceId);
          } catch {}

          if (registeredUserId) {
            this.broadcastDevicePresence(registeredUserId, registeredDeviceId, false);
          }
        }
      });

      ws.on('error', (err) => {
        logger.error(`WebSocket error on client ${registeredDeviceId}`, err);
      });
    });
  }

  private broadcastDevicePresence(userId: string, deviceId: string, isOnline: boolean): void {
    const presenceMessage = createEnvelope('device.presence', {
      deviceId,
      isOnline,
      timestamp: Date.now(),
    });
    const str = JSON.stringify(presenceMessage);

    for (const client of this.clients.values()) {
      if (client.userId === userId && client.deviceId !== deviceId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(str);
      }
    }
  }

  private bufferOfflineOperations(envelope: ProtocolEnvelope): void {
    const payload = envelope.payload as { workspaceId: string; deviceId: string; operations: SyncOperation[] };
    if (!payload || !Array.isArray(payload.operations)) return;

    for (const op of payload.operations) {
      try {
        const existing = this.db.prepare('SELECT operation_id FROM sync_operations WHERE operation_id = ?').get(op.operation_id);
        if (!existing) {
          this.db.prepare(`
            INSERT INTO sync_operations (
              operation_id, workspace_id, device_id, file_path, operation_type,
              base_version, payload, sequence_number, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            op.operation_id,
            payload.workspaceId,
            op.device_id,
            op.file_path,
            op.operation_type,
            op.base_version,
            op.payload,
            op.sequence_number || 0,
            'PENDING',
            op.created_at || Date.now()
          );
        }
      } catch (err) {
        logger.error('Error buffering offline operation', err);
      }
    }
  }

  private flushPendingOperationsToLaptop(laptopDeviceId: string, ws: WebSocket): void {
    try {
      const rows: any[] = this.db.prepare(`
        SELECT s.* FROM sync_operations s
        JOIN workspaces w ON s.workspace_id = w.id
        WHERE w.device_id = ? AND s.status = 'PENDING'
        ORDER BY s.created_at ASC
      `).all(laptopDeviceId);

      if (rows.length > 0) {
        logger.info(`Flushing ${rows.length} pending operations to newly reconnected laptop ${laptopDeviceId}`);
        const operations: SyncOperation[] = rows.map((r) => ({
          operation_id: r.operation_id,
          workspace_id: r.workspace_id,
          device_id: r.device_id,
          file_path: r.file_path,
          operation_type: r.operation_type,
          base_version: Number(r.base_version),
          payload: r.payload,
          sequence_number: Number(r.sequence_number),
          status: r.status,
          created_at: Number(r.created_at),
        }));

        const pushEnvelope = createEnvelope('sync.push_operations', {
          operations,
        }, { target: laptopDeviceId });

        ws.send(JSON.stringify(pushEnvelope));
      }
    } catch (err) {
      logger.error('Failed to flush pending operations to laptop', err);
    }
  }
}
