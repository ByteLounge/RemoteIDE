import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { TerminalSession, TerminalResize } from '@remotedev/types';
import { generateId, createLogger } from '@remotedev/shared-utils';
import { RemoteDevError } from '@remotedev/protocol';
import { WorkspaceManager } from './workspaces';

const logger = createLogger('TerminalManager');

interface ActiveSession {
  info: TerminalSession;
  process: ChildProcessWithoutNullStreams;
  buffer: string[];
}

export class TerminalManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private outputListeners: Map<string, (data: string) => void> = new Map();

  constructor(private workspaceManager: WorkspaceManager) {}

  public createSession(
    workspaceId: string,
    shell = 'powershell.exe',
    cols = 80,
    rows = 24
  ): TerminalSession {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const sessionId = generateId('term');

    // On Windows, use powershell.exe -NoLogo
    const isWindows = process.platform === 'win32';
    const shellCommand = shell || (isWindows ? 'powershell.exe' : '/bin/bash');
    const shellArgs = isWindows ? ['-NoLogo'] : [];

    try {
      const child = spawn(shellCommand, shellArgs, {
        cwd: ws.path,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLUMNS: String(cols),
          LINES: String(rows),
        },
        windowsHide: true,
      });

      const sessionInfo: TerminalSession = {
        sessionId,
        workspaceId,
        shell: shellCommand,
        cwd: ws.path,
        title: `Terminal: ${ws.name}`,
        createdAt: Date.now(),
        isActive: true,
      };

      const activeSession: ActiveSession = {
        info: sessionInfo,
        process: child,
        buffer: [],
      };

      this.sessions.set(sessionId, activeSession);

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        activeSession.buffer.push(text);
        if (activeSession.buffer.length > 500) activeSession.buffer.shift();

        const listener = this.outputListeners.get(sessionId);
        if (listener) listener(text);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        activeSession.buffer.push(text);
        if (activeSession.buffer.length > 500) activeSession.buffer.shift();

        const listener = this.outputListeners.get(sessionId);
        if (listener) listener(text);
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
    } catch (err: any) {
      logger.error('Failed to spawn terminal process', err);
      throw new RemoteDevError('COMMAND_FAILED', `Failed to launch shell: ${err.message}`);
    }
  }

  public writeInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.info.isActive) {
      throw new RemoteDevError('TERMINAL_SESSION_NOT_FOUND', `Active terminal ${sessionId} not found`);
    }

    // Support Ctrl+C (\x03)
    if (data === '\x03') {
      session.process.kill('SIGINT');
      return;
    }

    session.process.stdin.write(data);
  }

  public setOutputListener(sessionId: string, listener: (data: string) => void): void {
    this.outputListeners.set(sessionId, listener);

    // Send buffered recent history so client immediately sees prompt / output
    const session = this.sessions.get(sessionId);
    if (session && session.buffer.length > 0) {
      listener(session.buffer.join(''));
    }
  }

  public removeOutputListener(sessionId: string): void {
    this.outputListeners.delete(sessionId);
  }

  public listSessions(workspaceId?: string): TerminalSession[] {
    const all = Array.from(this.sessions.values()).map((s) => s.info);
    return workspaceId ? all.filter((s) => s.workspaceId === workspaceId) : all;
  }

  public killSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.info.isActive = false;
      try {
        session.process.kill();
      } catch {}
      this.sessions.delete(sessionId);
      this.outputListeners.delete(sessionId);
      logger.info(`Killed terminal session ${sessionId}`);
    }
  }
}
