"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitManager = void 0;
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const shared_utils_1 = require("@remotedev/shared-utils");
const protocol_1 = require("@remotedev/protocol");
const execFileAsync = util_1.default.promisify(child_process_1.execFile);
const logger = (0, shared_utils_1.createLogger)('GitManager');
class GitManager {
    workspaceManager;
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }
    async runGit(workspacePath, args) {
        try {
            const { stdout } = await execFileAsync('git', args, {
                cwd: workspacePath,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            });
            return stdout.trim();
        }
        catch (err) {
            logger.error(`Git command failed: git ${args.join(' ')}`, err);
            throw new protocol_1.RemoteDevError('COMMAND_FAILED', `Git error: ${err.stderr || err.message}`);
        }
    }
    async getStatus(workspaceId) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        try {
            // 1. Current branch
            const branchOutput = await this.runGit(ws.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
            const branch = branchOutput || 'main';
            // 2. Ahead / behind
            let ahead = 0;
            let behind = 0;
            let tracking;
            try {
                tracking = await this.runGit(ws.path, ['rev-parse', '--abbrev-ref', '@{u}']);
                const countOutput = await this.runGit(ws.path, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
                const [a, b] = countOutput.split(/\s+/).map((n) => parseInt(n, 10));
                ahead = isNaN(a) ? 0 : a;
                behind = isNaN(b) ? 0 : b;
            }
            catch {
                // No upstream configured, ignore
            }
            // 3. Status porcelain
            const statusOutput = await this.runGit(ws.path, ['status', '--porcelain=v1', '-uall']);
            const files = [];
            if (statusOutput) {
                const lines = statusOutput.split('\n');
                for (const line of lines) {
                    if (line.length < 4)
                        continue;
                    const stagedCode = line[0];
                    const unstagedCode = line[1];
                    const filePath = line.substring(3).trim();
                    const isUntracked = stagedCode === '?' && unstagedCode === '?';
                    const isStaged = stagedCode !== ' ' && stagedCode !== '?';
                    files.push({
                        path: filePath,
                        stagedStatus: stagedCode !== ' ' ? stagedCode : undefined,
                        unstagedStatus: unstagedCode !== ' ' ? unstagedCode : undefined,
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
        }
        catch (err) {
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
    async getDiff(workspaceId, filePath) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const args = ['diff', 'HEAD'];
        if (filePath) {
            args.push('--', filePath);
        }
        const diff = await this.runGit(ws.path, args);
        return { path: filePath, diff };
    }
    async stage(workspaceId, paths) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const targetPaths = paths.length > 0 ? paths : ['.'];
        await this.runGit(ws.path, ['add', ...targetPaths]);
    }
    async unstage(workspaceId, paths) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const targetPaths = paths.length > 0 ? paths : ['.'];
        await this.runGit(ws.path, ['reset', 'HEAD', ...targetPaths]);
    }
    async commit(workspaceId, message) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        if (!message || !message.trim()) {
            throw new protocol_1.RemoteDevError('COMMAND_FAILED', 'Commit message cannot be empty');
        }
        const summary = await this.runGit(ws.path, ['commit', '-m', message]);
        const commitHash = await this.runGit(ws.path, ['rev-parse', '--short', 'HEAD']);
        return { commitHash, summary };
    }
    async push(workspaceId, remote = 'origin', branch) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const args = ['push', remote];
        if (branch)
            args.push(branch);
        return this.runGit(ws.path, args);
    }
    async pull(workspaceId, remote = 'origin', branch) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const args = ['pull', remote];
        if (branch)
            args.push(branch);
        return this.runGit(ws.path, args);
    }
}
exports.GitManager = GitManager;
