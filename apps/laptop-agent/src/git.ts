import { execFile } from 'child_process';
import util from 'util';
import { GitStatusResult, GitFileStatus, GitDiffResult, GitStatusChar } from '@remotedev/types';
import { createLogger } from '@remotedev/shared-utils';
import { RemoteDevError } from '@remotedev/protocol';
import { WorkspaceManager } from './workspaces';

const execFileAsync = util.promisify(execFile);
const logger = createLogger('GitManager');

export class GitManager {
  constructor(private workspaceManager: WorkspaceManager) {}

  private async runGit(workspacePath: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: workspacePath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      return stdout.trim();
    } catch (err: any) {
      logger.error(`Git command failed: git ${args.join(' ')}`, err);
      throw new RemoteDevError('COMMAND_FAILED', `Git error: ${err.stderr || err.message}`);
    }
  }

  public async getStatus(workspaceId: string): Promise<GitStatusResult> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);

    try {
      // 1. Current branch
      const branchOutput = await this.runGit(ws.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const branch = branchOutput || 'main';

      // 2. Ahead / behind
      let ahead = 0;
      let behind = 0;
      let tracking: string | undefined;

      try {
        tracking = await this.runGit(ws.path, ['rev-parse', '--abbrev-ref', '@{u}']);
        const countOutput = await this.runGit(ws.path, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
        const [a, b] = countOutput.split(/\s+/).map((n) => parseInt(n, 10));
        ahead = isNaN(a) ? 0 : a;
        behind = isNaN(b) ? 0 : b;
      } catch {
        // No upstream configured, ignore
      }

      // 3. Status porcelain
      const statusOutput = await this.runGit(ws.path, ['status', '--porcelain=v1', '-uall']);
      const files: GitFileStatus[] = [];

      if (statusOutput) {
        const lines = statusOutput.split('\n');
        for (const line of lines) {
          if (line.length < 4) continue;
          const stagedCode = line[0];
          const unstagedCode = line[1];
          const filePath = line.substring(3).trim();

          const isUntracked = stagedCode === '?' && unstagedCode === '?';
          const isStaged = stagedCode !== ' ' && stagedCode !== '?';

          files.push({
            path: filePath,
            stagedStatus: stagedCode !== ' ' ? (stagedCode as GitStatusChar) : undefined,
            unstagedStatus: unstagedCode !== ' ' ? (unstagedCode as GitStatusChar) : undefined,
            isStaged,
            isUntracked,
          });
        }
      }

      return {
        branch,
        tracking,
        ahead,
        behind,
        files,
        clean: files.length === 0,
      };
    } catch (err: any) {
      logger.error('Failed to query git status', err);
      return {
        branch: 'unknown',
        ahead: 0,
        behind: 0,
        files: [],
        clean: true,
      };
    }
  }

  public async getDiff(workspaceId: string, filePath?: string): Promise<GitDiffResult> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const args = ['diff', 'HEAD'];
    if (filePath) {
      args.push('--', filePath);
    }
    const diff = await this.runGit(ws.path, args);
    return { path: filePath, diff };
  }

  public async stage(workspaceId: string, paths: string[]): Promise<void> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const targetPaths = paths.length > 0 ? paths : ['.'];
    await this.runGit(ws.path, ['add', ...targetPaths]);
  }

  public async unstage(workspaceId: string, paths: string[]): Promise<void> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const targetPaths = paths.length > 0 ? paths : ['.'];
    await this.runGit(ws.path, ['reset', 'HEAD', ...targetPaths]);
  }

  public async commit(workspaceId: string, message: string): Promise<{ commitHash: string; summary: string }> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    if (!message || !message.trim()) {
      throw new RemoteDevError('COMMAND_FAILED', 'Commit message cannot be empty');
    }

    const summary = await this.runGit(ws.path, ['commit', '-m', message]);
    const commitHash = await this.runGit(ws.path, ['rev-parse', '--short', 'HEAD']);
    return { commitHash, summary };
  }

  public async push(workspaceId: string, remote = 'origin', branch?: string): Promise<string> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const args = ['push', remote];
    if (branch) args.push(branch);
    return this.runGit(ws.path, args);
  }

  public async pull(workspaceId: string, remote = 'origin', branch?: string): Promise<string> {
    const ws = this.workspaceManager.getWorkspace(workspaceId);
    const args = ['pull', remote];
    if (branch) args.push(branch);
    return this.runGit(ws.path, args);
  }
}
