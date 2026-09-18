"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentSyncManager = void 0;
const fs_1 = __importDefault(require("fs"));
const sync_engine_1 = require("@remotedev/sync-engine");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('AgentSync');
class AgentSyncManager {
    workspaceManager;
    idempotencyTracker = new sync_engine_1.IdempotencyTracker(10000);
    activeConflicts = new Map();
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }
    applyOperations(workspaceId, operations) {
        const acceptedOperationIds = [];
        const conflicts = [];
        for (const op of operations) {
            // 1. Check Idempotency
            if (this.idempotencyTracker.has(op.operation_id)) {
                logger.info(`Operation ${op.operation_id} already applied, acknowledging duplicate`);
                acceptedOperationIds.push(op.operation_id);
                continue;
            }
            try {
                const ws = this.workspaceManager.getWorkspace(workspaceId);
                const safePath = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, op.file_path);
                const currentVersion = this.workspaceManager.getFileVersion(workspaceId, op.file_path);
                const fileExists = fs_1.default.existsSync(safePath);
                const diskContent = fileExists ? fs_1.default.readFileSync(safePath, 'utf8') : '';
                // 2. Conflict Detection
                if (op.operation_type === 'WRITE_FILE' || op.operation_type === 'REPLACE_TEXT' || op.operation_type === 'INSERT_TEXT') {
                    const conflict = (0, sync_engine_1.checkVersionConflict)(op, currentVersion, diskContent);
                    if (conflict) {
                        logger.warn(`Version mismatch detected on ${op.file_path}: base=${op.base_version}, current=${currentVersion}`);
                        this.activeConflicts.set(conflict.conflict_id, conflict);
                        conflicts.push(conflict);
                        continue;
                    }
                }
                // 3. Apply Operation
                switch (op.operation_type) {
                    case 'CREATE_FILE':
                        this.workspaceManager.createItem(workspaceId, op.file_path, 'file', op.payload);
                        break;
                    case 'DELETE_FILE':
                        this.workspaceManager.deleteItem(workspaceId, op.file_path);
                        break;
                    case 'RENAME_FILE': {
                        const parsed = JSON.parse(op.payload);
                        this.workspaceManager.renameItem(workspaceId, op.file_path, parsed.newPath);
                        break;
                    }
                    case 'WRITE_FILE':
                    case 'INSERT_TEXT':
                    case 'DELETE_TEXT':
                    case 'REPLACE_TEXT': {
                        const newContent = (0, sync_engine_1.applyTextOperation)(diskContent, op);
                        this.workspaceManager.writeFile(workspaceId, op.file_path, newContent, op.base_version);
                        break;
                    }
                }
                this.idempotencyTracker.markApplied(op.operation_id);
                acceptedOperationIds.push(op.operation_id);
            }
            catch (err) {
                logger.error(`Failed to apply operation ${op.operation_id}`, err);
            }
        }
        return { acceptedOperationIds, conflicts };
    }
    resolveConflict(resolution) {
        const conflict = this.activeConflicts.get(resolution.conflict_id);
        if (!conflict) {
            throw new Error(`Conflict ${resolution.conflict_id} not found or already resolved`);
        }
        const res = (0, sync_engine_1.resolveConflict)(conflict, resolution);
        this.workspaceManager.writeFile(conflict.workspace_id, conflict.file_path, res.finalContent);
        this.workspaceManager.setFileVersion(conflict.workspace_id, conflict.file_path, res.newVersion);
        this.activeConflicts.delete(resolution.conflict_id);
        return { newVersion: res.newVersion, path: conflict.file_path };
    }
}
exports.AgentSyncManager = AgentSyncManager;
