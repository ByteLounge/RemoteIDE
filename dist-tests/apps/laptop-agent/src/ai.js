"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAgentManager = exports.GenericCLIProvider = exports.GeminiCLIProvider = exports.ClaudeCodeProvider = void 0;
const child_process_1 = require("child_process");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('AIAgentManager');
class ClaudeCodeProvider {
    type = 'ClaudeCode';
    buildCommand(prompt) {
        return { command: 'claude', args: ['-p', prompt] };
    }
}
exports.ClaudeCodeProvider = ClaudeCodeProvider;
class GeminiCLIProvider {
    type = 'GeminiCLI';
    buildCommand(prompt) {
        return { command: 'gemini', args: [prompt] };
    }
}
exports.GeminiCLIProvider = GeminiCLIProvider;
class GenericCLIProvider {
    type = 'GenericCLI';
    buildCommand(prompt) {
        // Falls back to executing prompt via PowerShell script or CLI
        const isWindows = process.platform === 'win32';
        return isWindows
            ? { command: 'powershell.exe', args: ['-NoLogo', '-Command', prompt] }
            : { command: '/bin/sh', args: ['-c', prompt] };
    }
}
exports.GenericCLIProvider = GenericCLIProvider;
class AIAgentManager {
    workspaceManager;
    providers = new Map();
    activeSessions = new Map();
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
        this.providers.set('ClaudeCode', new ClaudeCodeProvider());
        this.providers.set('GeminiCLI', new GeminiCLIProvider());
        this.providers.set('GenericCLI', new GenericCLIProvider());
    }
    startSession(workspaceId, agentType, prompt, onChunk) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const provider = this.providers.get(agentType) || this.providers.get('GenericCLI');
        const sessionId = (0, shared_utils_1.generateId)('ai_sess');
        const sessionInfo = {
            sessionId,
            agentType,
            workspaceId,
            isActive: true,
            startedAt: Date.now(),
        };
        const { command, args } = provider.buildCommand(prompt, ws.path);
        logger.info(`Starting AI agent ${agentType} (${command} ${args.join(' ')}) in ${ws.path}`);
        try {
            const child = (0, child_process_1.spawn)(command, args, {
                cwd: ws.path,
                env: { ...process.env },
                windowsHide: true,
                shell: true,
            });
            this.activeSessions.set(sessionId, { info: sessionInfo, process: child });
            // Notify starting
            onChunk({
                sessionId,
                chunk: `[AI Agent Initialized: ${agentType}]\nPrompt: ${prompt}\n\n`,
                kind: 'thinking',
                timestamp: Date.now(),
            });
            child.stdout.on('data', (data) => {
                const text = data.toString('utf8');
                onChunk({
                    sessionId,
                    chunk: text,
                    kind: text.includes('tool') || text.includes('Running') ? 'tool_call' : 'response',
                    timestamp: Date.now(),
                });
            });
            child.stderr.on('data', (data) => {
                const text = data.toString('utf8');
                onChunk({
                    sessionId,
                    chunk: text,
                    kind: 'error',
                    timestamp: Date.now(),
                });
            });
            child.on('close', (code) => {
                sessionInfo.isActive = false;
                onChunk({
                    sessionId,
                    chunk: `\n[Agent process finished with code ${code}]`,
                    kind: 'response',
                    timestamp: Date.now(),
                });
            });
            child.on('error', (err) => {
                sessionInfo.isActive = false;
                onChunk({
                    sessionId,
                    chunk: `\n[Error launching ${command}: ${err.message}. Ensure '${command}' is installed or select Generic CLI.]\n`,
                    kind: 'error',
                    timestamp: Date.now(),
                });
            });
            return sessionInfo;
        }
        catch (err) {
            logger.error('Failed to start AI session', err);
            sessionInfo.isActive = false;
            onChunk({
                sessionId,
                chunk: `Failed to launch agent: ${err.message}`,
                kind: 'error',
                timestamp: Date.now(),
            });
            return sessionInfo;
        }
    }
    stopSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.process) {
            try {
                session.process.kill();
            }
            catch { }
            session.info.isActive = false;
            logger.info(`Stopped AI session ${sessionId}`);
        }
    }
}
exports.AIAgentManager = AIAgentManager;
