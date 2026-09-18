"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceManager = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const shared_utils_1 = require("@remotedev/shared-utils");
const protocol_1 = require("@remotedev/protocol");
const logger = (0, shared_utils_1.createLogger)('WorkspaceFS');
class WorkspaceManager {
    configManager;
    fileVersions = new Map(); // "workspaceId:relativePath" -> version
    constructor(configManager) {
        this.configManager = configManager;
    }
    getWorkspace(workspaceId) {
        const workspaces = this.configManager.getWorkspaces();
        const ws = workspaces.find((w) => w.id === workspaceId);
        if (!ws) {
            throw new protocol_1.RemoteDevError('WORKSPACE_NOT_FOUND', `Workspace "${workspaceId}" not found`);
        }
        return ws;
    }
    getFileVersion(workspaceId, relPath) {
        const key = `${workspaceId}:${relPath}`;
        return this.fileVersions.get(key) || 1;
    }
    setFileVersion(workspaceId, relPath, version) {
        const key = `${workspaceId}:${relPath}`;
        this.fileVersions.set(key, version);
    }
    listFiles(workspaceId, subPath = '', recursive = false) {
        const ws = this.getWorkspace(workspaceId);
        const targetDir = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, subPath);
        if (!fs_1.default.existsSync(targetDir)) {
            return [];
        }
        const scan = (dir) => {
            const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
            const items = [];
            for (const entry of entries) {
                const fullPath = path_1.default.join(dir, entry.name);
                const relPath = (0, shared_utils_1.toWorkspaceRelativePath)(ws.path, fullPath);
                if ((0, shared_utils_1.isPathExcluded)(relPath)) {
                    continue;
                }
                if (entry.isDirectory()) {
                    const item = {
                        name: entry.name,
                        path: relPath,
                        type: 'directory',
                        children: recursive ? scan(fullPath) : undefined,
                    };
                    items.push(item);
                }
                else if (entry.isFile()) {
                    try {
                        const stats = fs_1.default.statSync(fullPath);
                        items.push({
                            name: entry.name,
                            path: relPath,
                            type: 'file',
                            size: stats.size,
                            modifiedTime: stats.mtimeMs,
                            extension: path_1.default.extname(entry.name).slice(1),
                        });
                    }
                    catch {
                        // Ignore unreadable files
                    }
                }
            }
            return items;
        };
        return scan(targetDir);
    }
    readFile(workspaceId, relPath) {
        const ws = this.getWorkspace(workspaceId);
        const safePath = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, relPath);
        if (!fs_1.default.existsSync(safePath) || !fs_1.default.statSync(safePath).isFile()) {
            throw new protocol_1.RemoteDevError('FILE_NOT_FOUND', `File not found: ${relPath}`);
        }
        const content = fs_1.default.readFileSync(safePath, 'utf8');
        const hash = (0, shared_utils_1.hashContent)(content);
        const version = this.getFileVersion(workspaceId, relPath);
        return {
            path: relPath,
            content,
            version,
            hash,
        };
    }
    writeFile(workspaceId, relPath, content, baseVersion) {
        const ws = this.getWorkspace(workspaceId);
        const safePath = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, relPath);
        const currentVersion = this.getFileVersion(workspaceId, relPath);
        if (baseVersion !== undefined && baseVersion !== currentVersion) {
            // Check if file exists on disk and content actually differs
            if (fs_1.default.existsSync(safePath)) {
                const diskContent = fs_1.default.readFileSync(safePath, 'utf8');
                if (diskContent !== content) {
                    throw new protocol_1.RemoteDevError('BASE_VERSION_MISMATCH', 'File was modified on laptop', {
                        expectedVersion: currentVersion,
                        providedVersion: baseVersion,
                        laptopContent: diskContent,
                        phoneContent: content,
                    });
                }
            }
        }
        const dir = path_1.default.dirname(safePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        // Atomic write
        const tempPath = `${safePath}.tmp.${Date.now()}`;
        fs_1.default.writeFileSync(tempPath, content, 'utf8');
        fs_1.default.renameSync(tempPath, safePath);
        const newVersion = currentVersion + 1;
        this.setFileVersion(workspaceId, relPath, newVersion);
        const hash = (0, shared_utils_1.hashContent)(content);
        logger.info(`Saved ${relPath} (v${newVersion}) in workspace ${ws.name}`);
        return { newVersion, hash };
    }
    createItem(workspaceId, relPath, type, initialContent = '') {
        const ws = this.getWorkspace(workspaceId);
        const safePath = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, relPath);
        if (fs_1.default.existsSync(safePath)) {
            throw new protocol_1.RemoteDevError('FILE_ALREADY_EXISTS', `Item already exists: ${relPath}`);
        }
        if (type === 'directory') {
            fs_1.default.mkdirSync(safePath, { recursive: true });
        }
        else {
            const dir = path_1.default.dirname(safePath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            fs_1.default.writeFileSync(safePath, initialContent, 'utf8');
            this.setFileVersion(workspaceId, relPath, 1);
        }
    }
    deleteItem(workspaceId, relPath) {
        const ws = this.getWorkspace(workspaceId);
        const safePath = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, relPath);
        if (!fs_1.default.existsSync(safePath)) {
            return;
        }
        const stat = fs_1.default.statSync(safePath);
        if (stat.isDirectory()) {
            fs_1.default.rmSync(safePath, { recursive: true, force: true });
        }
        else {
            fs_1.default.unlinkSync(safePath);
        }
    }
    renameItem(workspaceId, oldPath, newPath) {
        const ws = this.getWorkspace(workspaceId);
        const safeOld = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, oldPath);
        const safeNew = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, newPath);
        if (!fs_1.default.existsSync(safeOld)) {
            throw new protocol_1.RemoteDevError('FILE_NOT_FOUND', `Source item not found: ${oldPath}`);
        }
        const targetDir = path_1.default.dirname(safeNew);
        if (!fs_1.default.existsSync(targetDir)) {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
        fs_1.default.renameSync(safeOld, safeNew);
    }
    searchFiles(workspaceId, query) {
        const ws = this.getWorkspace(workspaceId);
        const results = [];
        const queryLower = query.toLowerCase();
        const scan = (dir) => {
            if (results.length >= 50)
                return;
            const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (results.length >= 50)
                    break;
                const full = path_1.default.join(dir, entry.name);
                const rel = (0, shared_utils_1.toWorkspaceRelativePath)(ws.path, full);
                if ((0, shared_utils_1.isPathExcluded)(rel))
                    continue;
                if (entry.isDirectory()) {
                    scan(full);
                }
                else if (entry.isFile()) {
                    // Check file name match
                    if (entry.name.toLowerCase().includes(queryLower)) {
                        results.push({ path: rel });
                        continue;
                    }
                    // Check file text content (for text files < 500KB)
                    try {
                        const stat = fs_1.default.statSync(full);
                        if (stat.size < 500 * 1024) {
                            const text = fs_1.default.readFileSync(full, 'utf8');
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
                    }
                    catch { }
                }
            }
        };
        scan(ws.path);
        return results;
    }
}
exports.WorkspaceManager = WorkspaceManager;
