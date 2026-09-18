import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { ProcessInfo, ProcessLogEntry, ProcessStatus } from '@remotedev/types';
import { generateId, createLogger } from '@remotedev/shared-utils';
import { RemoteDevError } from '@remotedev/protocol';
import { WorkspaceManager } from './workspaces';

const logger = createLogger('ProcessManager');

interface ManagedProcess {
  info: ProcessInfo;
  process?: ChildProcessWithoutNullStreams;
  logs: ProcessLogEntry[];
}

export class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map();

  constructor(private workspaceManager: WorkspaceManager) {}

  public startProcess(workspaceId: string, command: string, args: string[] = []): ProcessInfo {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const processId = generateId('proc');

    const isWindows = process.platform === 'win32';
    // Use cmd.exe /c or powershell to properly parse shell syntax
    const shellExec = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', [command, ...args].join(' ')] : ['-c', [command, ...args].join(' ')];

    try {
      const child = spawn(shellExec, shellArgs, {
        cwd: ws.path,
        env: { ...process.env },
        windowsHide: true,
      });

      const info: ProcessInfo = {
        id: processId,
        workspaceId,
        command,
        args,
        pid: child.pid,
        status: 'RUNNING',
        startedAt: Date.now(),
      };

      const managed: ManagedProcess = {
        info,
        process: child,
        logs: [],
      };

      this.processes.set(processId, managed);

      const appendLog = (stream: 'stdout' | 'stderr', text: string) => {
        // Detect port in stdout/stderr (e.g. "localhost:3000", "port 8080", "127.0.0.1:4000")
        const portMatch = text.match(/(?:localhost|127\.0\.0\.1|port)\s*[:= ]\s*(\d{2,5})/i);
        if (portMatch && !info.port) {
          info.port = parseInt(portMatch[1], 10);
        }

        managed.logs.push({
          processId,
          stream,
          text,
          timestamp: Date.now(),
        });
        if (managed.logs.length > 1000) managed.logs.shift();
      };

      child.stdout.on('data', (chunk) => appendLog('stdout', chunk.toString('utf8')));
      child.stderr.on('data', (chunk) => appendLog('stderr', chunk.toString('utf8')));

      child.on('close', (code) => {
        info.status = code === 0 ? 'STOPPED' : 'FAILED';
        info.exitCode = code ?? undefined;
        logger.info(`Process ${processId} (${command}) exited with code ${code}`);
      });

      child.on('error', (err) => {
        info.status = 'FAILED';
        logger.error(`Process ${processId} error`, err);
      });

      logger.info(`Started process ${processId} (${command}) PID ${child.pid}`);
      return info;
    } catch (err: any) {
      logger.error(`Failed to launch process: ${command}`, err);
      throw new RemoteDevError('COMMAND_FAILED', `Failed to launch command: ${err.message}`);
    }
  }

  public stopProcess(processId: string): ProcessInfo {
    const managed = this.processes.get(processId);
    if (!managed) {
      throw new RemoteDevError('PROCESS_NOT_FOUND', `Process ${processId} not found`);
    }

    if (managed.process && managed.info.status === 'RUNNING') {
      try {
        managed.process.kill();
      } catch {}
      managed.info.status = 'STOPPED';
      logger.info(`Stopped process ${processId}`);
    }

    return managed.info;
  }

  public restartProcess(processId: string): ProcessInfo {
    const managed = this.processes.get(processId);
    if (!managed) {
      throw new RemoteDevError('PROCESS_NOT_FOUND', `Process ${processId} not found`);
    }

    this.stopProcess(processId);
    return this.startProcess(managed.info.workspaceId, managed.info.command, managed.info.args);
  }

  public listProcesses(workspaceId?: string): ProcessInfo[] {
    const all = Array.from(this.processes.values()).map((p) => p.info);
    return workspaceId ? all.filter((p) => p.workspaceId === workspaceId) : all;
  }

  public getLogs(processId: string): ProcessLogEntry[] {
    const managed = this.processes.get(processId);
    if (!managed) {
      throw new RemoteDevError('PROCESS_NOT_FOUND', `Process ${processId} not found`);
    }
    return managed.logs;
  }
}
