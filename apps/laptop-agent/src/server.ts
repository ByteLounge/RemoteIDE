import { WebSocketServer, WebSocket } from 'ws';
import { AgentConfigManager } from './config';
import { WorkspaceManager } from './workspaces';
import { AgentSyncManager } from './sync';
import { TerminalManager } from './terminal';
import { ProcessManager } from './processes';
import { GitManager } from './git';
import { IDEManager } from './ide';
import { AIAgentManager } from './ai';
import { WorkspaceWatcher } from './watcher';
import { getSystemStats } from './system';
import {
  parseProtocolMessage,
  createEnvelope,
  createErrorEnvelope,
  ProtocolEnvelope,
} from '@remotedev/protocol';
import { createLogger } from '@remotedev/shared-utils';

const logger = createLogger('AgentServer');

export class AgentServer {
  private localWss?: WebSocketServer;
  private relayWs?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectBackoffMs = 1000;

  constructor(
    private configManager: AgentConfigManager,
    private workspaceManager: WorkspaceManager,
    private syncManager: AgentSyncManager,
    private terminalManager: TerminalManager,
    private processManager: ProcessManager,
    private gitManager: GitManager,
    private ideManager: IDEManager,
    private aiManager: AIAgentManager,
    private watcher: WorkspaceWatcher
  ) {}

  public start(): void {
    const config = this.configManager.getConfig();

    // 1. Start Local WebSocket Server (Direct connection from Android on same LAN)
    try {
      this.localWss = new WebSocketServer({ port: config.port });
      this.localWss.on('connection', (ws) => {
        logger.info('Direct client connected via LAN');
        this.setupClientSocket(ws, 'DIRECT');
      });
      logger.info(`Direct WebSocket server listening on port ${config.port}`);
    } catch (err) {
      logger.error('Failed to start local WebSocket server', err);
    }

    // 2. Connect to Cloud Relay
    this.connectToRelay();

    // 3. Watcher events -> broadcast to connected clients
    this.watcher.onFileChange((event) => {
      const envelope = createEnvelope('file.watch.event', event);
      this.broadcast(envelope);
    });

    this.watcher.startWatching();
  }

  private connectToRelay(): void {
    const config = this.configManager.getConfig();
    if (!config.relayUrl) return;

    logger.info(`Connecting to Cloud Relay at ${config.relayUrl}...`);
    try {
      this.relayWs = new WebSocket(config.relayUrl);

      this.relayWs.on('open', () => {
        logger.info('Connected to Cloud Relay successfully');
        this.reconnectBackoffMs = 1000;

        // Perform Handshake
        const handshake = createEnvelope('auth.handshake', {
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
    } catch (err) {
      logger.error('Relay initialization error', err);
      this.scheduleRelayReconnect();
    }
  }

  private scheduleRelayReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectToRelay();
      this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.5, 30000);
    }, this.reconnectBackoffMs);
  }

  private setupClientSocket(ws: WebSocket, topology: 'DIRECT' | 'RELAY'): void {
    ws.on('message', async (data) => {
      try {
        const raw = data.toString('utf8');
        const envelope = parseProtocolMessage(raw);
        await this.handleMessage(ws, envelope);
      } catch (err: any) {
        logger.error('Error dispatching message', err);
      }
    });
  }

  private async handleMessage(ws: WebSocket, env: ProtocolEnvelope): Promise<void> {
    const reply = (type: string, payload?: any, success = true, error?: any) => {
      const response = createEnvelope(type, payload, {
        requestId: env.id,
        target: env.source,
        source: this.configManager.getConfig().deviceId,
        success,
        error,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    };

    const replyError = (code: any, message: string, details?: any) => {
      const errEnv = createErrorEnvelope(env.id, code, message, details);
      errEnv.target = env.source;
      errEnv.source = this.configManager.getConfig().deviceId;
      if (ws.readyState === WebSocket.OPEN) {
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
          reply('system.stats.response', { stats: getSystemStats(this.configManager.getConfig().agentVersion) });
          break;

        case 'device.pair': {
          const { code, deviceName } = env.payload as any;
          const token = this.configManager.verifyPairingCode(code);
          if (token) {
            reply('device.pair.response', {
              paired: true,
              deviceId: env.source || 'dev_paired_mobile',
              token,
              laptopName: this.configManager.getConfig().deviceName,
            });
          } else {
            replyError('INVALID_PAIRING_CODE', 'Invalid or expired pairing code');
          }
          break;
        }

        // --- Workspaces & Files ---
        case 'workspace.list':
          reply('workspace.list.response', { workspaces: this.configManager.getWorkspaces() });
          break;

        case 'file.list': {
          const { workspaceId, path: subPath, recursive } = env.payload as any;
          const items = this.workspaceManager.listFiles(workspaceId, subPath, recursive);
          reply('file.list.response', { workspaceId, path: subPath || '', items });
          break;
        }

        case 'file.read': {
          const { workspaceId, path: filePath } = env.payload as any;
          const file = this.workspaceManager.readFile(workspaceId, filePath);
          reply('file.read.response', { workspaceId, file });
          break;
        }

        case 'file.write': {
          const { workspaceId, path: filePath, content, baseVersion } = env.payload as any;
          this.watcher.recordSelfWrite(workspaceId, filePath);
          const result = this.workspaceManager.writeFile(workspaceId, filePath, content, baseVersion);
          reply('file.write.response', { workspaceId, path: filePath, ...result });
          break;
        }

        case 'file.create': {
          const { workspaceId, path: filePath, type, initialContent } = env.payload as any;
          this.watcher.recordSelfWrite(workspaceId, filePath);
          this.workspaceManager.createItem(workspaceId, filePath, type, initialContent);
          reply('file.create.response', { workspaceId, path: filePath, created: true });
          break;
        }

        case 'file.delete': {
          const { workspaceId, path: filePath } = env.payload as any;
          this.watcher.recordSelfWrite(workspaceId, filePath);
          this.workspaceManager.deleteItem(workspaceId, filePath);
          reply('file.delete.response', { workspaceId, path: filePath, deleted: true });
          break;
        }

        case 'file.rename': {
          const { workspaceId, oldPath, newPath } = env.payload as any;
          this.watcher.recordSelfWrite(workspaceId, oldPath);
          this.watcher.recordSelfWrite(workspaceId, newPath);
          this.workspaceManager.renameItem(workspaceId, oldPath, newPath);
          reply('file.rename.response', { workspaceId, oldPath, newPath, renamed: true });
          break;
        }

        case 'file.search': {
          const { workspaceId, query } = env.payload as any;
          const results = this.workspaceManager.searchFiles(workspaceId, query);
          reply('file.search.response', { workspaceId, results });
          break;
        }

        // --- Sync Operations ---
        case 'sync.push_operations': {
          const { workspaceId, operations } = env.payload as any;
          const result = this.syncManager.applyOperations(workspaceId, operations);
          reply('sync.push_operations.response', result);
          break;
        }

        case 'sync.conflict_resolve': {
          const result = this.syncManager.resolveConflict(env.payload as any);
          reply('sync.conflict_resolve.response', result);
          break;
        }

        // --- Terminal ---
        case 'terminal.create': {
          const { workspaceId, shell, cols, rows } = env.payload as any;
          const session = this.terminalManager.createSession(workspaceId, shell, cols, rows);

          this.terminalManager.setOutputListener(session.sessionId, (data) => {
            const outEnv = createEnvelope('terminal.output', {
              sessionId: session.sessionId,
              data,
            }, { target: env.source, source: this.configManager.getConfig().deviceId });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(outEnv));
            }
          });

          reply('terminal.create.response', session);
          break;
        }

        case 'terminal.input': {
          const { sessionId, data } = env.payload as any;
          this.terminalManager.writeInput(sessionId, data);
          break;
        }

        case 'terminal.kill': {
          const { sessionId } = env.payload as any;
          this.terminalManager.killSession(sessionId);
          reply('terminal.kill.response', { sessionId, killed: true });
          break;
        }

        case 'terminal.list': {
          const { workspaceId } = (env.payload as any) || {};
          const sessions = this.terminalManager.listSessions(workspaceId);
          reply('terminal.list.response', { sessions });
          break;
        }

        // --- Processes ---
        case 'process.start': {
          const { workspaceId, command, args } = env.payload as any;
          const proc = this.processManager.startProcess(workspaceId, command, args);
          reply('process.start.response', proc);
          break;
        }

        case 'process.stop': {
          const { processId } = env.payload as any;
          const proc = this.processManager.stopProcess(processId);
          reply('process.stop.response', proc);
          break;
        }

        case 'process.restart': {
          const { processId } = env.payload as any;
          const proc = this.processManager.restartProcess(processId);
          reply('process.restart.response', proc);
          break;
        }

        case 'process.list': {
          const { workspaceId } = (env.payload as any) || {};
          const processes = this.processManager.listProcesses(workspaceId);
          reply('process.list.response', { processes });
          break;
        }

        case 'process.logs': {
          const { processId } = env.payload as any;
          const logs = this.processManager.getLogs(processId);
          reply('process.logs.response', { processId, logs });
          break;
        }

        // --- Git ---
        case 'git.status': {
          const { workspaceId } = env.payload as any;
          const status = await this.gitManager.getStatus(workspaceId);
          reply('git.status.response', { workspaceId, status });
          break;
        }

        case 'git.diff': {
          const { workspaceId, path: filePath } = env.payload as any;
          const diffResult = await this.gitManager.getDiff(workspaceId, filePath);
          reply('git.diff.response', { workspaceId, ...diffResult });
          break;
        }

        case 'git.stage': {
          const { workspaceId, paths } = env.payload as any;
          await this.gitManager.stage(workspaceId, paths || []);
          reply('git.stage.response', { workspaceId, staged: true });
          break;
        }

        case 'git.unstage': {
          const { workspaceId, paths } = env.payload as any;
          await this.gitManager.unstage(workspaceId, paths || []);
          reply('git.unstage.response', { workspaceId, unstaged: true });
          break;
        }

        case 'git.commit': {
          const { workspaceId, message } = env.payload as any;
          const res = await this.gitManager.commit(workspaceId, message);
          reply('git.commit.response', { workspaceId, ...res });
          break;
        }

        case 'git.push': {
          const { workspaceId, remote, branch } = env.payload as any;
          const out = await this.gitManager.push(workspaceId, remote, branch);
          reply('git.push.response', { workspaceId, output: out });
          break;
        }

        case 'git.pull': {
          const { workspaceId, remote, branch } = env.payload as any;
          const out = await this.gitManager.pull(workspaceId, remote, branch);
          reply('git.pull.response', { workspaceId, output: out });
          break;
        }

        // --- AI Agent ---
        case 'ai.session.start': {
          const { workspaceId, agentType, prompt } = env.payload as any;
          const session = this.aiManager.startSession(workspaceId, agentType, prompt, (chunk) => {
            const chunkEnv = createEnvelope('ai.session.chunk', chunk, {
              target: env.source,
              source: this.configManager.getConfig().deviceId,
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(chunkEnv));
            }
          });
          reply('ai.session.start.response', session);
          break;
        }

        case 'ai.session.stop': {
          const { sessionId } = env.payload as any;
          this.aiManager.stopSession(sessionId);
          reply('ai.session.stop.response', { sessionId, stopped: true });
          break;
        }

        default:
          logger.warn(`Unknown message type: ${env.type}`);
          break;
      }
    } catch (err: any) {
      logger.error(`Error processing message ${env.type}`, err);
      replyError(err.code || 'INTERNAL_ERROR', err.message || 'Operation failed', err.details);
    }
  }

  private broadcast(envelope: ProtocolEnvelope): void {
    const raw = JSON.stringify(envelope);
    if (this.localWss) {
      for (const client of this.localWss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(raw);
      }
    }
    if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      this.relayWs.send(raw);
    }
  }
}
