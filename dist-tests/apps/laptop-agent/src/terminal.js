"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalManager = void 0;
const child_process_1 = require("child_process");
const shared_utils_1 = require("@remotedev/shared-utils");
const protocol_1 = require("@remotedev/protocol");
const logger = (0, shared_utils_1.createLogger)('TerminalManager');
class TerminalManager {
    workspaceManager;
    sessions = new Map();
    outputListeners = new Map();
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }
    createSession(workspaceId, shell = 'powershell.exe', cols = 80, rows = 24) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const sessionId = (0, shared_utils_1.generateId)('term');
        // On Windows, use powershell.exe -NoLogo
        const isWindows = process.platform === 'win32';
        const shellCommand = shell || (isWindows ? 'powershell.exe' : '/bin/bash');
        const shellArgs = isWindows ? ['-NoLogo'] : [];
        try {
            const child = (0, child_process_1.spawn)(shellCommand, shellArgs, {
                cwd: ws.path,
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    COLUMNS: String(cols),
                    LINES: String(rows),
                },
                windowsHide: true,
            });
            const sessionInfo = {
                sessionId,
                workspaceId,
                shell: shellCommand,
                cwd: ws.path,
                title: `Terminal: ${ws.name}`,
                createdAt: Date.now(),
                isActive: true,
            };
            const activeSession = {
                info: sessionInfo,
                process: child,
                buffer: [],
            };
            this.sessions.set(sessionId, activeSession);
            child.stdout.on('data', (chunk) => {
                const text = chunk.toString('utf8');
                activeSession.buffer.push(text);
                if (activeSession.buffer.length > 500)
                    activeSession.buffer.shift();
                const listener = this.outputListeners.get(sessionId);
                if (listener)
                    listener(text);
            });
            child.stderr.on('data', (chunk) => {
                const text = chunk.toString('utf8');
                activeSession.buffer.push(text);
                if (activeSession.buffer.length > 500)
                    activeSession.buffer.shift();
                const listener = this.outputListeners.get(sessionId);
                if (listener)
                    listener(text);
            });
            child.on('close', (code) => {
                logger.info(`Terminal session ${sessionId} closed with code ${code}`);
                sessionInfo.isActive = false;
            });
            child.on('error', (err) => {
                logger.error(`Terminal session ${sessionId} error`, err);
                sessionInfo.isActive = false;
            });
            logger.info(`Spawned terminal session ${sessionId} (${shellCommand}) in ${ws.path}`);
            return sessionInfo;
        }
        catch (err) {
            logger.error('Failed to spawn terminal process', err);
            throw new protocol_1.RemoteDevError('COMMAND_FAILED', `Failed to launch shell: ${err.message}`);
        }
    }
    writeInput(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.info.isActive) {
            throw new protocol_1.RemoteDevError('TERMINAL_SESSION_NOT_FOUND', `Active terminal ${sessionId} not found`);
        }
        // Support Ctrl+C (\x03)
        if (data === '\x03') {
            session.process.kill('SIGINT');
            return;
        }
        session.process.stdin.write(data);
    }
    setOutputListener(sessionId, listener) {
        this.outputListeners.set(sessionId, listener);
        // Send buffered recent history so client immediately sees prompt / output
        const session = this.sessions.get(sessionId);
        if (session && session.buffer.length > 0) {
            listener(session.buffer.join(''));
        }
    }
    removeOutputListener(sessionId) {
        this.outputListeners.delete(sessionId);
    }
    listSessions(workspaceId) {
        const all = Array.from(this.sessions.values()).map((s) => s.info);
        return workspaceId ? all.filter((s) => s.workspaceId === workspaceId) : all;
    }
    killSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.info.isActive = false;
            try {
                session.process.kill();
            }
            catch { }
            this.sessions.delete(sessionId);
            this.outputListeners.delete(sessionId);
            logger.info(`Killed terminal session ${sessionId}`);
        }
    }
}
exports.TerminalManager = TerminalManager;
