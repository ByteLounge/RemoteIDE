import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { AIAgentType, AIAgentSession, AIAgentChunk } from '@remotedev/types';
import { generateId, createLogger } from '@remotedev/shared-utils';
import { WorkspaceManager } from './workspaces';

const logger = createLogger('AIAgentManager');

export interface AIAgentProvider {
  type: AIAgentType;
  buildCommand(prompt: string, workspacePath: string): { command: string; args: string[] };
}

export class ClaudeCodeProvider implements AIAgentProvider {
  type: AIAgentType = 'ClaudeCode';
  buildCommand(prompt: string): { command: string; args: string[] } {
    return { command: 'claude', args: ['-p', prompt] };
  }
}

export class GeminiCLIProvider implements AIAgentProvider {
  type: AIAgentType = 'GeminiCLI';
  buildCommand(prompt: string): { command: string; args: string[] } {
    return { command: 'gemini', args: [prompt] };
  }
}

export class GenericCLIProvider implements AIAgentProvider {
  type: AIAgentType = 'GenericCLI';
  buildCommand(prompt: string): { command: string; args: string[] } {
    // Falls back to executing prompt via PowerShell script or CLI
    const isWindows = process.platform === 'win32';
    return isWindows
      ? { command: 'powershell.exe', args: ['-NoLogo', '-Command', prompt] }
      : { command: '/bin/sh', args: ['-c', prompt] };
  }
}

interface ActiveAISession {
  info: AIAgentSession;
  process?: ChildProcessWithoutNullStreams;
}

export class AIAgentManager {
  private providers: Map<AIAgentType, AIAgentProvider> = new Map();
  private activeSessions: Map<string, ActiveAISession> = new Map();

  constructor(private workspaceManager: WorkspaceManager) {
    this.providers.set('ClaudeCode', new ClaudeCodeProvider());
    this.providers.set('GeminiCLI', new GeminiCLIProvider());
    this.providers.set('GenericCLI', new GenericCLIProvider());
  }

  public startSession(
    workspaceId: string,
    agentType: AIAgentType,
    prompt: string,
    onChunk: (chunk: AIAgentChunk) => void
  ): AIAgentSession {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const provider = this.providers.get(agentType) || this.providers.get('GenericCLI')!;
    const sessionId = generateId('ai_sess');

    const sessionInfo: AIAgentSession = {
      sessionId,
      agentType,
      workspaceId,
      isActive: true,
      startedAt: Date.now(),
    };

    const { command, args } = provider.buildCommand(prompt, ws.path);
    logger.info(`Starting AI agent ${agentType} (${command} ${args.join(' ')}) in ${ws.path}`);

    try {
      const child = spawn(command, args, {
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
    } catch (err: any) {
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

  public stopSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session && session.process) {
      try {
        session.process.kill();
      } catch {}
      session.info.isActive = false;
      logger.info(`Stopped AI session ${sessionId}`);
    }
  }
}
