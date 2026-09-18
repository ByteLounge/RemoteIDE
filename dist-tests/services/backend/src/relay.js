"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayServer = void 0;
const ws_1 = require("ws");
const shared_utils_1 = require("@remotedev/shared-utils");
const protocol_1 = require("@remotedev/protocol");
const logger = (0, shared_utils_1.createLogger)('RelayServer');
class RelayServer {
    db;
    authService;
    wss;
    clients = new Map(); // deviceId -> ConnectedClient
    constructor(server, db, authService) {
        this.db = db;
        this.authService = authService;
        this.wss = new ws_1.WebSocketServer({ server, path: '/ws' });
        this.setupServer();
        logger.info('WebSocket relay server initialized on path /ws');
    }
    setupServer() {
        this.wss.on('connection', (ws, req) => {
            let registeredDeviceId = null;
            let registeredUserId = null;
            logger.info(`New WebSocket client connected from ${req.socket.remoteAddress}`);
            ws.on('message', (data) => {
                try {
                    const rawStr = data.toString('utf8');
                    const envelope = (0, protocol_1.parseProtocolMessage)(rawStr);
                    // Handle Authentication / Handshake
                    if (envelope.type === 'auth.handshake') {
                        const payload = envelope.payload;
                        const token = payload?.token;
                        const deviceId = payload?.deviceId || `dev_${Date.now()}`;
                        const deviceType = payload?.deviceType || 'UNKNOWN';
                        let userId = 'user_dev_001';
                        if (token) {
                            const verifiedId = this.authService.verifyToken(token);
                            if (verifiedId)
                                userId = verifiedId;
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
                        }
                        catch { }
                        // Send handshake confirmation
                        const response = (0, protocol_1.createEnvelope)('auth.handshake.response', {
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
                        ws.send(JSON.stringify((0, protocol_1.createEnvelope)('pong', { time: Date.now() }, { requestId: envelope.id })));
                        return;
                    }
                    // Message Routing
                    if (envelope.target) {
                        const targetClient = this.clients.get(envelope.target);
                        if (targetClient && targetClient.ws.readyState === ws_1.WebSocket.OPEN) {
                            // Target is online: forward frame
                            targetClient.ws.send(rawStr);
                            logger.debug(`Relayed message ${envelope.type} from ${envelope.source} to ${envelope.target}`);
                        }
                        else {
                            // Target is offline!
                            logger.warn(`Target device ${envelope.target} is offline`);
                            // Special offline behavior: buffer push_operations in DB
                            if (envelope.type === 'sync.push_operations') {
                                this.bufferOfflineOperations(envelope);
                                const ack = (0, protocol_1.createEnvelope)('sync.push_operations.response', {
                                    buffered: true,
                                    status: 'QUEUED_IN_CLOUD',
                                    acceptedOperationIds: envelope.payload?.operations?.map((o) => o.operation_id) || [],
                                }, { requestId: envelope.id });
                                ws.send(JSON.stringify(ack));
                            }
                            else {
                                // Return offline error envelope
                                ws.send(JSON.stringify((0, protocol_1.createErrorEnvelope)(envelope.id, 'INTERNAL_ERROR', `Target device ${envelope.target} is currently offline.`)));
                            }
                        }
                    }
                    else {
                        // Broadcast or local agent handling
                        logger.debug(`Unhandled or non-targeted message: ${envelope.type}`);
                    }
                }
                catch (err) {
                    logger.error('Error handling WebSocket message', err);
                }
            });
            ws.on('close', () => {
                if (registeredDeviceId) {
                    this.clients.delete(registeredDeviceId);
                    logger.info(`Device disconnected: ${registeredDeviceId}`);
                    try {
                        this.db.prepare('UPDATE devices SET is_online = 0, last_seen_at = ? WHERE id = ?').run(Date.now(), registeredDeviceId);
                    }
                    catch { }
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
    broadcastDevicePresence(userId, deviceId, isOnline) {
        const presenceMessage = (0, protocol_1.createEnvelope)('device.presence', {
            deviceId,
            isOnline,
            timestamp: Date.now(),
        });
        const str = JSON.stringify(presenceMessage);
        for (const client of this.clients.values()) {
            if (client.userId === userId && client.deviceId !== deviceId && client.ws.readyState === ws_1.WebSocket.OPEN) {
                client.ws.send(str);
            }
        }
    }
    bufferOfflineOperations(envelope) {
        const payload = envelope.payload;
        if (!payload || !Array.isArray(payload.operations))
            return;
        for (const op of payload.operations) {
            try {
                const existing = this.db.prepare('SELECT operation_id FROM sync_operations WHERE operation_id = ?').get(op.operation_id);
                if (!existing) {
                    this.db.prepare(`
            INSERT INTO sync_operations (
              operation_id, workspace_id, device_id, file_path, operation_type,
              base_version, payload, sequence_number, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(op.operation_id, payload.workspaceId, op.device_id, op.file_path, op.operation_type, op.base_version, op.payload, op.sequence_number || 0, 'PENDING', op.created_at || Date.now());
                }
            }
            catch (err) {
                logger.error('Error buffering offline operation', err);
            }
        }
    }
    flushPendingOperationsToLaptop(laptopDeviceId, ws) {
        try {
            const rows = this.db.prepare(`
        SELECT s.* FROM sync_operations s
        JOIN workspaces w ON s.workspace_id = w.id
        WHERE w.device_id = ? AND s.status = 'PENDING'
        ORDER BY s.created_at ASC
      `).all(laptopDeviceId);
            if (rows.length > 0) {
                logger.info(`Flushing ${rows.length} pending operations to newly reconnected laptop ${laptopDeviceId}`);
                const operations = rows.map((r) => ({
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
                const pushEnvelope = (0, protocol_1.createEnvelope)('sync.push_operations', {
                    operations,
                }, { target: laptopDeviceId });
                ws.send(JSON.stringify(pushEnvelope));
            }
        }
        catch (err) {
            logger.error('Failed to flush pending operations to laptop', err);
        }
    }
}
exports.RelayServer = RelayServer;
