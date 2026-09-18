import fs from 'fs';
import path from 'path';
import { WorkspaceManager } from './workspaces';
import { AgentConfigManager } from './config';
import { isPathExcluded, toWorkspaceRelativePath, createLogger } from '@remotedev/shared-utils';
import { FileWatchEventPayload } from '@remotedev/protocol';

const logger = createLogger('FileWatcher');

export class WorkspaceWatcher {
  private watchers: Map<string, fs.FSWatcher[]> = new Map();
  private recentSelfWrites: Map<string, number> = new Map(); // "workspaceId:relPath" -> timestamp
  private listeners: ((event: FileWatchEventPayload) => void)[] = [];

  constructor(private configManager: AgentConfigManager, private workspaceManager: WorkspaceManager) {}

  public recordSelfWrite(workspaceId: string, relPath: string): void {
    const key = `${workspaceId}:${relPath}`;
    this.recentSelfWrites.set(key, Date.now() + 2000); // Ignore notifications for next 2 seconds
  }

  public isSelfWrite(workspaceId: string, relPath: string): boolean {
    const key = `${workspaceId}:${relPath}`;
    const expiry = this.recentSelfWrites.get(key);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.recentSelfWrites.delete(key);
      return false;
    }
    return true;
  }

  public startWatching(): void {
    const workspaces = this.configManager.getWorkspaces();
    for (const ws of workspaces) {
      this.watchWorkspace(ws.id, ws.path);
    }
  }

  private watchWorkspace(workspaceId: string, rootPath: string): void {
    if (!fs.existsSync(rootPath)) return;

    try {
      const watcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const relPath = filename.replace(/\\/g, '/');

        if (isPathExcluded(relPath)) return;

        // Check echo suppression
        if (this.isSelfWrite(workspaceId, relPath)) {
          return;
        }

        const fullPath = path.join(rootPath, filename);
        const exists = fs.existsSync(fullPath);

        const payload: FileWatchEventPayload = {
          workspaceId,
          path: relPath,
          event: exists ? 'modified' : 'deleted',
          sourceDeviceId: this.configManager.getConfig().deviceId,
        };

        for (const listener of this.listeners) {
          listener(payload);
        }
      });

      this.watchers.set(workspaceId, [watcher]);
      logger.info(`Watching workspace ${workspaceId} at ${rootPath}`);
    } catch (err) {
      logger.error(`Failed to watch workspace ${workspaceId}`, err);
    }
  }

  public onFileChange(listener: (event: FileWatchEventPayload) => void): void {
    this.listeners.push(listener);
  }

  public stopAll(): void {
    for (const watcherList of this.watchers.values()) {
      for (const w of watcherList) {
        try {
          w.close();
        } catch {}
      }
    }
    this.watchers.clear();
  }
}
