import { exec } from 'child_process';
import util from 'util';
import { createLogger, resolveSafeWorkspacePath } from '@remotedev/shared-utils';
import { WorkspaceManager } from './workspaces';

const execAsync = util.promisify(exec);
const logger = createLogger('IDEProvider');

export interface IDEProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  openFile(workspacePath: string, filePath: string, line?: number): Promise<boolean>;
  openWorkspace(workspacePath: string): Promise<boolean>;
}

export class VSCodeProvider implements IDEProvider {
  name = 'VS Code';

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('code --version');
      return true;
    } catch {
      return false;
    }
  }

  async openFile(workspacePath: string, filePath: string, line?: number): Promise<boolean> {
    try {
      const target = line ? `${filePath}:${line}` : filePath;
      await execAsync(`code --goto "${target}"`, { cwd: workspacePath });
      return true;
    } catch (err) {
      logger.error('Failed to open file in VS Code', err);
      return false;
    }
  }

  async openWorkspace(workspacePath: string): Promise<boolean> {
    try {
      await execAsync(`code "${workspacePath}"`);
      return true;
    } catch (err) {
      logger.error('Failed to open workspace in VS Code', err);
      return false;
    }
  }
}

export class AntigravityProvider implements IDEProvider {
  name = 'Antigravity';

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('agy --version');
      return true;
    } catch {
      return false;
    }
  }

  async openFile(workspacePath: string, filePath: string): Promise<boolean> {
    try {
      await execAsync(`agy open "${filePath}"`, { cwd: workspacePath });
      return true;
    } catch {
      return false;
    }
  }

  async openWorkspace(workspacePath: string): Promise<boolean> {
    try {
      await execAsync(`agy "${workspacePath}"`);
      return true;
    } catch {
      return false;
    }
  }
}

export class IDEManager {
  private providers: IDEProvider[];

  constructor(private workspaceManager: WorkspaceManager) {
    this.providers = [new VSCodeProvider(), new AntigravityProvider()];
  }

  public async openFileInIDE(workspaceId: string, filePath: string, line?: number): Promise<boolean> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const absPath = resolveSafeWorkspacePath(ws.path, filePath);

    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        logger.info(`Opening ${filePath} via ${provider.name}`);
        return provider.openFile(ws.path, absPath, line);
      }
    }

    logger.warn('No supported IDE found on laptop');
    return false;
  }
}
