"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiRouter = createApiRouter;
const express_1 = require("express");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('BackendRoutes');
function createApiRouter(db, authService) {
    const router = (0, express_1.Router)();
    // Auth Middleware
    const requireAuth = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } });
        }
        const token = authHeader.split(' ')[1];
        const userId = authService.verifyToken(token);
        if (!userId) {
            return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token is invalid or expired' } });
        }
        req.userId = userId;
        next();
    };
    // -------------------------------------------------------------------------
    // Health
    // -------------------------------------------------------------------------
    router.get('/health', (req, res) => {
        res.json({ status: 'ok', service: 'remotedev-backend', version: '0.1.0', timestamp: Date.now() });
    });
    // -------------------------------------------------------------------------
    // Auth Routes
    // -------------------------------------------------------------------------
    router.post('/auth/register', (req, res) => {
        try {
            const { email, password, name } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: { code: 'COMMAND_FAILED', message: 'Email and password required' } });
            }
            const result = authService.register(email, password, name);
            res.status(201).json(result);
        }
        catch (err) {
            res.status(400).json({ error: { code: err.code || 'COMMAND_FAILED', message: err.message } });
        }
    });
    router.post('/auth/login', (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: { code: 'COMMAND_FAILED', message: 'Email and password required' } });
            }
            const result = authService.login(email, password);
            res.json(result);
        }
        catch (err) {
            res.status(401).json({ error: { code: err.code || 'UNAUTHORIZED', message: err.message } });
        }
    });
    router.get('/auth/me', requireAuth, (req, res) => {
        const user = authService.getUserById(req.userId);
        if (!user) {
            return res.status(404).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
        }
        res.json({ user });
    });
    // -------------------------------------------------------------------------
    // Device & Pairing Routes
    // -------------------------------------------------------------------------
    router.get('/devices', requireAuth, (req, res) => {
        const rows = db.prepare('SELECT * FROM devices WHERE user_id = ?').all(req.userId);
        const devices = rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            name: r.name,
            deviceType: r.device_type,
            platform: r.platform,
            isOnline: Boolean(r.is_online),
            lastSeenAt: new Date(Number(r.last_seen_at)).toISOString(),
            agentVersion: r.agent_version,
        }));
        res.json({ devices });
    });
    // Laptop Agent requests a pairing code
    router.post('/devices/pairing-code', requireAuth, (req, res) => {
        const { laptopDeviceId } = req.body;
        const { formatted, raw } = (0, shared_utils_1.generatePairingCode)();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL
        // Clean up expired codes
        db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(Date.now());
        db.prepare('INSERT OR REPLACE INTO pairing_codes (code, laptop_device_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(raw, laptopDeviceId || 'dev_laptop_001', req.userId, expiresAt, Date.now());
        logger.info(`Generated pairing code: ${formatted} (expires in 5 min) for user ${req.userId}`);
        res.json({ code: formatted, rawCode: raw, expiresAt });
    });
    // Android submits code to pair
    router.post('/devices/pair', requireAuth, (req, res) => {
        const { code, deviceName, deviceType } = req.body;
        const rawCode = String(code).replace(/\s+/g, '');
        const row = db.prepare('SELECT * FROM pairing_codes WHERE code = ? AND expires_at > ?').get(rawCode, Date.now());
        if (!row) {
            return res.status(400).json({ error: { code: 'INVALID_PAIRING_CODE', message: 'Pairing code is invalid or has expired' } });
        }
        // Delete used code
        db.prepare('DELETE FROM pairing_codes WHERE code = ?').run(rawCode);
        const androidDeviceId = (0, shared_utils_1.generateId)('dev_android');
        const now = Date.now();
        db.prepare('INSERT INTO devices (id, user_id, name, device_type, platform, is_online, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(androidDeviceId, req.userId, deviceName || 'Android Phone', deviceType || 'ANDROID_PHONE', 'android', 1, now, now);
        res.json({
            paired: true,
            deviceId: androidDeviceId,
            laptopDeviceId: row.laptop_device_id,
            token: authService.generateSessionToken(req.userId),
        });
    });
    router.post('/devices/:id/revoke', requireAuth, (req, res) => {
        db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        res.json({ revoked: true });
    });
    // -------------------------------------------------------------------------
    // Workspace Routes
    // -------------------------------------------------------------------------
    router.get('/workspaces', requireAuth, (req, res) => {
        const rows = db.prepare('SELECT * FROM workspaces WHERE user_id = ?').all(req.userId);
        const workspaces = rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            deviceId: r.device_id,
            name: r.name,
            path: r.path,
            description: r.description,
            createdAt: new Date(Number(r.created_at)).toISOString(),
            updatedAt: new Date(Number(r.updated_at)).toISOString(),
        }));
        res.json({ workspaces });
    });
    router.post('/workspaces', requireAuth, (req, res) => {
        const { name, path, deviceId, description } = req.body;
        if (!name || !path) {
            return res.status(400).json({ error: { code: 'COMMAND_FAILED', message: 'Name and path are required' } });
        }
        const workspaceId = (0, shared_utils_1.generateId)('ws');
        const now = Date.now();
        db.prepare('INSERT INTO workspaces (id, user_id, device_id, name, path, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(workspaceId, req.userId, deviceId || 'dev_laptop_001', name, path, description ?? null, now, now);
        const workspace = {
            id: workspaceId,
            userId: req.userId,
            deviceId: deviceId || 'dev_laptop_001',
            name,
            path,
            description,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
        };
        res.status(201).json({ workspace });
    });
    // -------------------------------------------------------------------------
    // Operation Synchronization Routes
    // -------------------------------------------------------------------------
    router.post('/sync/operations', requireAuth, (req, res) => {
        const { workspaceId, deviceId, operations } = req.body;
        if (!workspaceId || !Array.isArray(operations)) {
            return res.status(400).json({ error: { code: 'COMMAND_FAILED', message: 'workspaceId and operations array required' } });
        }
        const acceptedOperationIds = [];
        // Find highest sequence number for workspace
        const maxSeqRow = db
            .prepare('SELECT MAX(sequence_number) as max_seq FROM sync_operations WHERE workspace_id = ?')
            .get(workspaceId);
        let nextSeq = (maxSeqRow?.max_seq ? Number(maxSeqRow.max_seq) : 0) + 1;
        for (const op of operations) {
            const existing = db.prepare('SELECT operation_id FROM sync_operations WHERE operation_id = ?').get(op.operation_id);
            if (existing) {
                // Idempotency: acknowledge without duplicate insert
                acceptedOperationIds.push(op.operation_id);
                continue;
            }
            db.prepare(`INSERT INTO sync_operations (
          operation_id, workspace_id, device_id, file_path, operation_type,
          base_version, payload, sequence_number, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(op.operation_id, workspaceId, deviceId || req.userId, op.file_path, op.operation_type, op.base_version, op.payload, nextSeq++, op.status || 'PENDING', op.created_at || Date.now());
            acceptedOperationIds.push(op.operation_id);
        }
        res.json({
            acceptedOperationIds,
            currentSequenceNumber: nextSeq - 1,
        });
    });
    router.get('/sync/operations', requireAuth, (req, res) => {
        const { workspaceId, sinceSequence } = req.query;
        const since = Number(sinceSequence || 0);
        const rows = db
            .prepare('SELECT * FROM sync_operations WHERE workspace_id = ? AND sequence_number > ? ORDER BY sequence_number ASC')
            .all(String(workspaceId), since);
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
        const maxSeq = operations.length > 0 ? operations[operations.length - 1].sequence_number : since;
        res.json({
            operations,
            latestSequenceNumber: maxSeq,
        });
    });
    router.post('/sync/ack', requireAuth, (req, res) => {
        const { operationIds } = req.body;
        if (Array.isArray(operationIds)) {
            for (const opId of operationIds) {
                db.prepare("UPDATE sync_operations SET status = 'ACKNOWLEDGED' WHERE operation_id = ?").run(opId);
            }
        }
        res.json({ acknowledged: true });
    });
    return router;
}
