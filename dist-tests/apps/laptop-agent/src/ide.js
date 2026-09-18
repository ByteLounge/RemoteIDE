"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDEManager = exports.AntigravityProvider = exports.VSCodeProvider = void 0;
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const shared_utils_1 = require("@remotedev/shared-utils");
const execAsync = util_1.default.promisify(child_process_1.exec);
const logger = (0, shared_utils_1.createLogger)('IDEProvider');
class VSCodeProvider {
    name = 'VS Code';
    async isAvailable() {
        try {
            await execAsync('code --version');
            return true;
        }
        catch {
            return false;
        }
    }
    async openFile(workspacePath, filePath, line) {
        try {
            const target = line ? `${filePath}:${line}` : filePath;
            await execAsync(`code --goto "${target}"`, { cwd: workspacePath });
            return true;
        }
        catch (err) {
            logger.error('Failed to open file in VS Code', err);
            return false;
        }
    }
    async openWorkspace(workspacePath) {
        try {
            await execAsync(`code "${workspacePath}"`);
            return true;
        }
        catch (err) {
            logger.error('Failed to open workspace in VS Code', err);
            return false;
        }
    }
}
exports.VSCodeProvider = VSCodeProvider;
class AntigravityProvider {
    name = 'Antigravity';
    async isAvailable() {
        try {
            await execAsync('agy --version');
            return true;
        }
        catch {
            return false;
        }
    }
    async openFile(workspacePath, filePath) {
        try {
            await execAsync(`agy open "${filePath}"`, { cwd: workspacePath });
            return true;
        }
        catch {
            return false;
        }
    }
    async openWorkspace(workspacePath) {
        try {
            await execAsync(`agy "${workspacePath}"`);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.AntigravityProvider = AntigravityProvider;
class IDEManager {
    workspaceManager;
    providers;
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
        this.providers = [new VSCodeProvider(), new AntigravityProvider()];
    }
    async openFileInIDE(workspaceId, filePath, line) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const absPath = (0, shared_utils_1.resolveSafeWorkspacePath)(ws.path, filePath);
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
exports.IDEManager = IDEManager;
