"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentConfigManager = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const shared_utils_1 = require("@remotedev/shared-utils");
class AgentConfigManager {
    configPath;
    workspacesPath;
    currentPairingCode = null;
    pairedTokens = new Set();
    constructor() {
        const dataDir = path_1.default.resolve(process.cwd(), 'data');
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
        this.configPath = path_1.default.join(dataDir, 'agent_config.json');
        this.workspacesPath = path_1.default.join(dataDir, 'agent_workspaces.json');
        this.initDefaultConfig();
    }
    initDefaultConfig() {
        if (!fs_1.default.existsSync(this.configPath)) {
            const initial = {
                deviceId: 'dev_laptop_001',
                deviceName: 'My Windows Laptop',
                port: 8765,
                relayUrl: process.env.CLOUD_RELAY_URL || 'ws://localhost:4000/ws',
                agentVersion: '0.1.0',
            };
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(initial, null, 2));
        }
        if (!fs_1.default.existsSync(this.workspacesPath)) {
            // Default approved workspace: the active repository directory
            const defaultWorkspace = {
                id: 'ws_remoteide_001',
                userId: 'user_dev_001',
                deviceId: 'dev_laptop_001',
                name: 'RemoteIDE',
                path: path_1.default.resolve(process.cwd()),
                description: 'Main Remote Development Monorepo',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            fs_1.default.writeFileSync(this.workspacesPath, JSON.stringify([defaultWorkspace], null, 2));
        }
    }
    getConfig() {
        try {
            return JSON.parse(fs_1.default.readFileSync(this.configPath, 'utf8'));
        }
        catch {
            return {
                deviceId: 'dev_laptop_001',
                deviceName: 'My Windows Laptop',
                port: 8765,
                relayUrl: 'ws://localhost:4000/ws',
                agentVersion: '0.1.0',
            };
        }
    }
    getWorkspaces() {
        try {
            return JSON.parse(fs_1.default.readFileSync(this.workspacesPath, 'utf8'));
        }
        catch {
            return [];
        }
    }
    addWorkspace(name, absPath) {
        const workspaces = this.getWorkspaces();
        const resolved = path_1.default.resolve(absPath);
        const existing = workspaces.find((w) => path_1.default.resolve(w.path) === resolved);
        if (existing)
            return existing;
        const newWs = {
            id: (0, shared_utils_1.generateId)('ws'),
            userId: 'user_dev_001',
            deviceId: this.getConfig().deviceId,
            name,
            path: resolved,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        workspaces.push(newWs);
        fs_1.default.writeFileSync(this.workspacesPath, JSON.stringify(workspaces, null, 2));
        return newWs;
    }
    getPairingCode() {
        const now = Date.now();
        if (!this.currentPairingCode || this.currentPairingCode.expiresAt <= now) {
            const { formatted, raw } = (0, shared_utils_1.generatePairingCode)();
            this.currentPairingCode = {
                code: formatted,
                raw,
                expiresAt: now + 5 * 60 * 1000, // 5 min TTL
            };
        }
        return { formatted: this.currentPairingCode.code, expiresAt: this.currentPairingCode.expiresAt };
    }
    verifyPairingCode(enteredCode) {
        const clean = enteredCode.replace(/\s+/g, '');
        const now = Date.now();
        if (this.currentPairingCode && this.currentPairingCode.raw === clean && this.currentPairingCode.expiresAt > now) {
            const token = (0, shared_utils_1.generateToken)(32);
            this.pairedTokens.add(token);
            this.currentPairingCode = null; // consume code
            return token;
        }
        return null;
    }
    isTokenValid(token) {
        return this.pairedTokens.has(token);
    }
}
exports.AgentConfigManager = AgentConfigManager;
