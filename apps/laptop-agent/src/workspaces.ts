import path from 'path';
import fs from 'fs';
import { AgentConfigManager } from './config';
import {
  resolveSafeWorkspacePath,
  toWorkspaceRelativePath,
  isPathExcluded,
  hashContent,
  createLogger,
} from '@remotedev/shared-utils';
import { FileItem, FileContent } from '@remotedev/types';
import { RemoteDevError } from '@remotedev/protocol';

const logger = createLogger('WorkspaceFS');

export class WorkspaceManager {
  private fileVersions: Map<string, number> = new Map(); // "workspaceId:relativePath" -> version

  constructor(private configManager: AgentConfigManager) {}

  public getWorkspace(workspaceId: string) {
    const workspaces = this.configManager.getWorkspaces();
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) {
      throw new RemoteDevError('WORKSPACE_NOT_FOUND', `Workspace "${workspaceId}" not found`);
    }
    return ws;
  }

  public getFileVersion(workspaceId: string, relPath: string): number {
    const key = `${workspaceId}:${relPath}`;
    return this.fileVersions.get(key) || 1;
  }

  public setFileVersion(workspaceId: string, relPath: string, version: number): void {
    const key = `${workspaceId}:${relPath}`;
    this.fileVersions.set(key, version);
  }

  public listFiles(workspaceId: string, subPath = '', recursive = false): FileItem[] {
    const ws = this.getWorkspace(workspaceId);
    const targetDir = resolveSafeWorkspacePath(ws.path, subPath);

    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const scan = (dir: string): FileItem[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const items: FileItem[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = toWorkspaceRelativePath(ws.path, fullPath);

        if (isPathExcluded(relPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          const item: FileItem = {
            name: entry.name,
            path: relPath,
            type: 'directory',
            children: recursive ? scan(fullPath) : undefined,
          };
          items.push(item);
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            items.push({
              name: entry.name,
              path: relPath,
              type: 'file',
              size: stats.size,
              modifiedTime: stats.mtimeMs,
              extension: path.extname(entry.name).slice(1),
            });
          } catch {
            // Ignore unreadable files
          }
        }
      }
      return items;
    };

    return scan(targetDir);
  }

  public readFile(workspaceId: string, relPath: string): FileContent {
    const ws = this.getWorkspace(workspaceId);
    const safePath = resolveSafeWorkspacePath(ws.path, relPath);

    if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
      throw new RemoteDevError('FILE_NOT_FOUND', `File not found: ${relPath}`);
    }

    const content = fs.readFileSync(safePath, 'utf8');
    const hash = hashContent(content);
    const version = this.getFileVersion(workspaceId, relPath);

    return {
      path: relPath,
      content,
      version,
      hash,
    };
  }

  public writeFile(
    workspaceId: string,
    relPath: string,
    content: string,
    baseVersion?: number
  ): { newVersion: number; hash: string } {
    const ws = this.getWorkspace(workspaceId);
    const safePath = resolveSafeWorkspacePath(ws.path, relPath);
    const currentVersion = this.getFileVersion(workspaceId, relPath);

    if (baseVersion !== undefined && baseVersion !== currentVersion) {
      // Check if file exists on disk and content actually differs
      if (fs.existsSync(safePath)) {
        const diskContent = fs.readFileSync(safePath, 'utf8');
        if (diskContent !== content) {
          throw new RemoteDevError('BASE_VERSION_MISMATCH', 'File was modified on laptop', {
            expectedVersion: currentVersion,
            providedVersion: baseVersion,
            laptopContent: diskContent,
            phoneContent: content,
          });
        }
      }
    }

    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Atomic write
    const tempPath = `${safePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, safePath);

    const newVersion = currentVersion + 1;
    this.setFileVersion(workspaceId, relPath, newVersion);
    const hash = hashContent(content);

    logger.info(`Saved ${relPath} (v${newVersion}) in workspace ${ws.name}`);
    return { newVersion, hash };
  }

  public createItem(
    workspaceId: string,
    relPath: string,
    type: 'file' | 'directory',
    initialContent = ''
  ): void {
    const ws = this.getWorkspace(workspaceId);
    const safePath = resolveSafeWorkspacePath(ws.path, relPath);

    if (fs.existsSync(safePath)) {
      throw new RemoteDevError('FILE_ALREADY_EXISTS', `Item already exists: ${relPath}`);
    }

    if (type === 'directory') {
      fs.mkdirSync(safePath, { recursive: true });
    } else {
      const dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(safePath, initialContent, 'utf8');
      this.setFileVersion(workspaceId, relPath, 1);
    }
  }

  public deleteItem(workspaceId: string, relPath: string): void {
    const ws = this.getWorkspace(workspaceId);
    const safePath = resolveSafeWorkspacePath(ws.path, relPath);

    if (!fs.existsSync(safePath)) {
      return;
    }

    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      fs.rmSync(safePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(safePath);
    }
  }

  public renameItem(workspaceId: string, oldPath: string, newPath: string): void {
    const ws = this.getWorkspace(workspaceId);
    const safeOld = resolveSafeWorkspacePath(ws.path, oldPath);
    const safeNew = resolveSafeWorkspacePath(ws.path, newPath);

    if (!fs.existsSync(safeOld)) {
      throw new RemoteDevError('FILE_NOT_FOUND', `Source item not found: ${oldPath}`);
    }

    const targetDir = path.dirname(safeNew);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.renameSync(safeOld, safeNew);
  }

  public searchFiles(workspaceId: string, query: string): { path: string; line?: number; matchSnippet?: string }[] {
    const ws = this.getWorkspace(workspaceId);
    const results: { path: string; line?: number; matchSnippet?: string }[] = [];
    const queryLower = query.toLowerCase();

    const scan = (dir: string) => {
      if (results.length >= 50) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= 50) break;
        const full = path.join(dir, entry.name);
        const rel = toWorkspaceRelativePath(ws.path, full);

        if (isPathExcluded(rel)) continue;

        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile()) {
          // Check file name match
          if (entry.name.toLowerCase().includes(queryLower)) {
            results.push({ path: rel });
            continue;
          }

          // Check file text content (for text files < 500KB)
          try {
            const stat = fs.statSync(full);
            if (stat.size < 500 * 1024) {
              const text = fs.readFileSync(full, 'utf8');
              const lines = text.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                  results.push({
                    path: rel,
                    line: i + 1,
                    matchSnippet: lines[i].trim().slice(0, 100),
                  });
                  break;
                }
              }
            }
          } catch {}
        }
      }
    };

    scan(ws.path);
    return results;
  }
}
