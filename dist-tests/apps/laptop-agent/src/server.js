"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentServer = void 0;
const ws_1 = require("ws");
const system_1 = require("./system");
const protocol_1 = require("@remotedev/protocol");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('AgentServer');
class AgentServer {
    configManager;
    workspaceManager;
    syncManager;
    terminalManager;
    processManager;
    gitManager;
    ideManager;
    aiManager;
    watcher;
    localWss;
    relayWs;
    reconnectTimer;
    reconnectBackoffMs = 1000;
    constructor(configManager, workspaceManager, syncManager, terminalManager, processManager, gitManager, ideManager, aiManager, watcher) {
        this.configManager = configManager;
        this.workspaceManager = workspaceManager;
        this.syncManager = syncManager;
        this.terminalManager = terminalManager;
        this.processManager = processManager;
        this.gitManager = gitManager;
        this.ideManager = ideManager;
        this.aiManager = aiManager;
        this.watcher = watcher;
    }
    start() {
        const config = this.configManager.getConfig();
        // 1. Start Local WebSocket Server (Direct connection from Android on same LAN)
        try {
            this.localWss = new ws_1.WebSocketServer({ port: config.port });
            this.localWss.on('connection', (ws) => {
                logger.info('Direct client connected via LAN');
                this.setupClientSocket(ws, 'DIRECT');
            });
            logger.info(`Direct WebSocket server listening on port ${config.port}`);
        }
        catch (err) {
            logger.error('Failed to start local WebSocket server', err);
        }
        // 2. Connect to Cloud Relay
        this.connectToRelay();
        // 3. Watcher events -> broadcast to connected clients
        this.watcher.onFileChange((event) => {
            const envelope = (0, protocol_1.createEnvelope)('file.watch.event', event);
            this.broadcast(envelope);
        });
        this.watcher.startWatching();
    }
    connectToRelay() {
        const config = this.configManager.getConfig();
        if (!config.relayUrl)
            return;
        logger.info(`Connecting to Cloud Relay at ${config.relayUrl}...`);
        try {
            this.relayWs = new ws_1.WebSocket(config.relayUrl);
            this.relayWs.on('open', () => {
                logger.info('Connected to Cloud Relay successfully');
                this.reconnectBackoffMs = 1000;
                // Perform Handshake
                const handshake = (0, protocol_1.createEnvelope)('auth.handshake', {
                    deviceId: config.deviceId,
                    deviceType: 'WINDOWS_LAPTOP',
                    agentVersion: config.agentVersion,
                });
                this.relayWs?.send(JSON.stringify(handshake));
            });
            this.setupClientSocket(this.relayWs, 'RELAY');
            this.relayWs.on('close', () => {
                logger.warn('Disconnected from Cloud Relay, scheduling reconnect...');
                this.scheduleRelayReconnect();
            });
            this.relayWs.on('error', (err) => {
                logger.error('Cloud Relay connection error', err);
            });
        }
        catch (err) {
            logger.error('Relay initialization error', err);
            this.scheduleRelayReconnect();
        }
    }
    scheduleRelayReconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connectToRelay();
            this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.5, 30000);
        }, this.reconnectBackoffMs);
    }
    setupClientSocket(ws, topology) {
        ws.on('message', async (data) => {
            try {
                const raw = data.toString('utf8');
                const envelope = (0, protocol_1.parseProtocolMessage)(raw);
                await this.handleMessage(ws, envelope);
            }
            catch (err) {
                logger.error('Error dispatching message', err);
            }
        });
    }
    async handleMessage(ws, env) {
        const reply = (type, payload, success = true, error) => {
            const response = (0, protocol_1.createEnvelope)(type, payload, {
                requestId: env.id,
                target: env.source,
                source: this.configManager.getConfig().deviceId,
                success,
                error,
            });
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify(response));
            }
        };
        const replyError = (code, message, details) => {
            const errEnv = (0, protocol_1.createErrorEnvelope)(env.id, code, message, details);
            errEnv.target = env.source;
            errEnv.source = this.configManager.getConfig().deviceId;
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify(errEnv));
            }
        };
        try {
            switch (env.type) {
                // --- Diagnostics & Pairing ---
                case 'ping':
                    reply('pong', { time: Date.now() });
                    break;
                case 'system.stats':
                    reply('system.stats.response', { stats: (0, system_1.getSystemStats)(this.configManager.getConfig().agentVersion) });
                    break;
                case 'device.pair': {
                    const { code, deviceName } = env.payload;
                    const token = this.configManager.verifyPairingCode(code);
                    if (token) {
                        reply('device.pair.response', {
                            paired: true,
                            deviceId: env.source || 'dev_paired_mobile',
                            token,
                            laptopName: this.configManager.getConfig().deviceName,
                        });
                    }
                    else {
                        replyError('INVALID_PAIRING_CODE', 'Invalid or expired pairing code');
                    }
                    break;
                }
                // --- Workspaces & Files ---
                case 'workspace.list':
                    reply('workspace.list.response', { workspaces: this.configManager.getWorkspaces() });
                    break;
                case 'file.list': {
                    const { workspaceId, path: subPath, recursive } = env.payload;
                    const items = this.workspaceManager.listFiles(workspaceId, subPath, recursive);
                    reply('file.list.response', { workspaceId, path: subPath || '', items });
                    break;
                }
                case 'file.read': {
                    const { workspaceId, path: filePath } = env.payload;
                    const file = this.workspaceManager.readFile(workspaceId, filePath);
                    reply('file.read.response', { workspaceId, file });
                    break;
                }
                case 'file.write': {
                    const { workspaceId, path: filePath, content, baseVersion } = env.payload;
                    this.watcher.recordSelfWrite(workspaceId, filePath);
                    const result = this.workspaceManager.writeFile(workspaceId, filePath, content, baseVersion);
                    reply('file.write.response', { workspaceId, path: filePath, ...result });
                    break;
                }
                case 'file.create': {
                    const { workspaceId, path: filePath, type, initialContent } = env.payload;
                    this.watcher.recordSelfWrite(workspaceId, filePath);
                    this.workspaceManager.createItem(workspaceId, filePath, type, initialContent);
                    reply('file.create.response', { workspaceId, path: filePath, created: true });
                    break;
                }
                case 'file.delete': {
                    const { workspaceId, path: filePath } = env.payload;
                    this.watcher.recordSelfWrite(workspaceId, filePath);
                    this.workspaceManager.deleteItem(workspaceId, filePath);
                    reply('file.delete.response', { workspaceId, path: filePath, deleted: true });
                    break;
                }
                case 'file.rename': {
                    const { workspaceId, oldPath, newPath } = env.payload;
                    this.watcher.recordSelfWrite(workspaceId, oldPath);
                    this.watcher.recordSelfWrite(workspaceId, newPath);
                    this.workspaceManager.renameItem(workspaceId, oldPath, newPath);
                    reply('file.rename.response', { workspaceId, oldPath, newPath, renamed: true });
                    break;
                }
                case 'file.search': {
                    const { workspaceId, query } = env.payload;
                    const results = this.workspaceManager.searchFiles(workspaceId, query);
                    reply('file.search.response', { workspaceId, results });
                    break;
                }
                // --- Sync Operations ---
                case 'sync.push_operations': {
                    const { workspaceId, operations } = env.payload;
                    const result = this.syncManager.applyOperations(workspaceId, operations);
                    reply('sync.push_operations.response', result);
                    break;
                }
                case 'sync.conflict_resolve': {
                    const result = this.syncManager.resolveConflict(env.payload);
                    reply('sync.conflict_resolve.response', result);
                    break;
                }
                // --- Terminal ---
                case 'terminal.create': {
                    const { workspaceId, shell, cols, rows } = env.payload;
                    const session = this.terminalManager.createSession(workspaceId, shell, cols, rows);
                    this.terminalManager.setOutputListener(session.sessionId, (data) => {
                        const outEnv = (0, protocol_1.createEnvelope)('terminal.output', {
                            sessionId: session.sessionId,
                            data,
                        }, { target: env.source, source: this.configManager.getConfig().deviceId });
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify(outEnv));
                        }
                    });
                    reply('terminal.create.response', session);
                    break;
                }
                case 'terminal.input': {
                    const { sessionId, data } = env.payload;
                    this.terminalManager.writeInput(sessionId, data);
                    break;
                }
                case 'terminal.kill': {
                    const { sessionId } = env.payload;
                    this.terminalManager.killSession(sessionId);
                    reply('terminal.kill.response', { sessionId, killed: true });
                    break;
                }
                case 'terminal.list': {
                    const { workspaceId } = env.payload || {};
                    const sessions = this.terminalManager.listSessions(workspaceId);
                    reply('terminal.list.response', { sessions });
                    break;
                }
                // --- Processes ---
                case 'process.start': {
                    const { workspaceId, command, args } = env.payload;
                    const proc = this.processManager.startProcess(workspaceId, command, args);
                    reply('process.start.response', proc);
                    break;
                }
                case 'process.stop': {
                    const { processId } = env.payload;
                    const proc = this.processManager.stopProcess(processId);
                    reply('process.stop.response', proc);
                    break;
                }
                case 'process.restart': {
                    const { processId } = env.payload;
                    const proc = this.processManager.restartProcess(processId);
                    reply('process.restart.response', proc);
                    break;
                }
                case 'process.list': {
                    const { workspaceId } = env.payload || {};
                    const processes = this.processManager.listProcesses(workspaceId);
                    reply('process.list.response', { processes });
                    break;
                }
                case 'process.logs': {
                    const { processId } = env.payload;
                    const logs = this.processManager.getLogs(processId);
                    reply('process.logs.response', { processId, logs });
                    break;
                }
                // --- Git ---
                case 'git.status': {
                    const { workspaceId } = env.payload;
                    const status = await this.gitManager.getStatus(workspaceId);
                    reply('git.status.response', { workspaceId, status });
                    break;
                }
                case 'git.diff': {
                    const { workspaceId, path: filePath } = env.payload;
                    const diffResult = await this.gitManager.getDiff(workspaceId, filePath);
                    reply('git.diff.response', { workspaceId, ...diffResult });
                    break;
                }
                case 'git.stage': {
                    const { workspaceId, paths } = env.payload;
                    await this.gitManager.stage(workspaceId, paths || []);
                    reply('git.stage.response', { workspaceId, staged: true });
                    break;
                }
                case 'git.unstage': {
                    const { workspaceId, paths } = env.payload;
                    await this.gitManager.unstage(workspaceId, paths || []);
                    reply('git.unstage.response', { workspaceId, unstaged: true });
                    break;
                }
                case 'git.commit': {
                    const { workspaceId, message } = env.payload;
                    const res = await this.gitManager.commit(workspaceId, message);
                    reply('git.commit.response', { workspaceId, ...res });
                    break;
                }
                case 'git.push': {
                    const { workspaceId, remote, branch } = env.payload;
                    const out = await this.gitManager.push(workspaceId, remote, branch);
                    reply('git.push.response', { workspaceId, output: out });
                    break;
                }
                case 'git.pull': {
                    const { workspaceId, remote, branch } = env.payload;
                    const out = await this.gitManager.pull(workspaceId, remote, branch);
                    reply('git.pull.response', { workspaceId, output: out });
                    break;
                }
                // --- AI Agent ---
                case 'ai.session.start': {
                    const { workspaceId, agentType, prompt } = env.payload;
                    const session = this.aiManager.startSession(workspaceId, agentType, prompt, (chunk) => {
                        const chunkEnv = (0, protocol_1.createEnvelope)('ai.session.chunk', chunk, {
                            target: env.source,
                            source: this.configManager.getConfig().deviceId,
                        });
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify(chunkEnv));
                        }
                    });
                    reply('ai.session.start.response', session);
                    break;
                }
                case 'ai.session.stop': {
                    const { sessionId } = env.payload;
                    this.aiManager.stopSession(sessionId);
                    reply('ai.session.stop.response', { sessionId, stopped: true });
                    break;
                }
                default:
                    logger.warn(`Unknown message type: ${env.type}`);
                    break;
            }
        }
        catch (err) {
            logger.error(`Error processing message ${env.type}`, err);
            replyError(err.code || 'INTERNAL_ERROR', err.message || 'Operation failed', err.details);
        }
    }
    broadcast(envelope) {
        const raw = JSON.stringify(envelope);
        if (this.localWss) {
            for (const client of this.localWss.clients) {
                if (client.readyState === ws_1.WebSocket.OPEN)
                    client.send(raw);
            }
        }
        if (this.relayWs && this.relayWs.readyState === ws_1.WebSocket.OPEN) {
            this.relayWs.send(raw);
        }
    }
}
exports.AgentServer = AgentServer;
