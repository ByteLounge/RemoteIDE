"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceWatcher = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('FileWatcher');
class WorkspaceWatcher {
    configManager;
    workspaceManager;
    watchers = new Map();
    recentSelfWrites = new Map(); // "workspaceId:relPath" -> timestamp
    listeners = [];
    constructor(configManager, workspaceManager) {
        this.configManager = configManager;
        this.workspaceManager = workspaceManager;
    }
    recordSelfWrite(workspaceId, relPath) {
        const key = `${workspaceId}:${relPath}`;
        this.recentSelfWrites.set(key, Date.now() + 2000); // Ignore notifications for next 2 seconds
    }
    isSelfWrite(workspaceId, relPath) {
        const key = `${workspaceId}:${relPath}`;
        const expiry = this.recentSelfWrites.get(key);
        if (!expiry)
            return false;
        if (Date.now() > expiry) {
            this.recentSelfWrites.delete(key);
            return false;
        }
        return true;
    }
    startWatching() {
        const workspaces = this.configManager.getWorkspaces();
        for (const ws of workspaces) {
            this.watchWorkspace(ws.id, ws.path);
        }
    }
    watchWorkspace(workspaceId, rootPath) {
        if (!fs_1.default.existsSync(rootPath))
            return;
        try {
            const watcher = fs_1.default.watch(rootPath, { recursive: true }, (eventType, filename) => {
                if (!filename)
                    return;
                const relPath = filename.replace(/\\/g, '/');
                if ((0, shared_utils_1.isPathExcluded)(relPath))
                    return;
                // Check echo suppression
                if (this.isSelfWrite(workspaceId, relPath)) {
                    return;
                }
                const fullPath = path_1.default.join(rootPath, filename);
                const exists = fs_1.default.existsSync(fullPath);
                const payload = {
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
        }
        catch (err) {
            logger.error(`Failed to watch workspace ${workspaceId}`, err);
        }
    }
    onFileChange(listener) {
        this.listeners.push(listener);
    }
    stopAll() {
        for (const watcherList of this.watchers.values()) {
            for (const w of watcherList) {
                try {
                    w.close();
                }
                catch { }
            }
        }
        this.watchers.clear();
    }
}
exports.WorkspaceWatcher = WorkspaceWatcher;
