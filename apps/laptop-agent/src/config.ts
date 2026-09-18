import path from 'path';
import fs from 'fs';
import { Workspace } from '@remotedev/types';
import { generateId, generatePairingCode, generateToken } from '@remotedev/shared-utils';

export interface AgentConfig {
  deviceId: string;
  deviceName: string;
  port: number;
  relayUrl: string;
  agentVersion: string;
}

export class AgentConfigManager {
  private configPath: string;
  private workspacesPath: string;
  private currentPairingCode: { code: string; raw: string; expiresAt: number } | null = null;
  private pairedTokens: Set<string> = new Set();

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.configPath = path.join(dataDir, 'agent_config.json');
    this.workspacesPath = path.join(dataDir, 'agent_workspaces.json');
    this.initDefaultConfig();
  }

  private initDefaultConfig(): void {
    if (!fs.existsSync(this.configPath)) {
      const initial: AgentConfig = {
        deviceId: 'dev_laptop_001',
        deviceName: 'My Windows Laptop',
        port: 8765,
        relayUrl: process.env.CLOUD_RELAY_URL || 'ws://localhost:4000/ws',
        agentVersion: '0.1.0',
      };
      fs.writeFileSync(this.configPath, JSON.stringify(initial, null, 2));
    }

    if (!fs.existsSync(this.workspacesPath)) {
      // Default approved workspace: the active repository directory
      const defaultWorkspace: Workspace = {
        id: 'ws_remoteide_001',
        userId: 'user_dev_001',
        deviceId: 'dev_laptop_001',
        name: 'RemoteIDE',
        path: path.resolve(process.cwd()),
        description: 'Main Remote Development Monorepo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.workspacesPath, JSON.stringify([defaultWorkspace], null, 2));
    }
  }

  public getConfig(): AgentConfig {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    } catch {
      return {
        deviceId: 'dev_laptop_001',
        deviceName: 'My Windows Laptop',
        port: 8765,
        relayUrl: 'ws://localhost:4000/ws',
        agentVersion: '0.1.0',
      };
    }
  }

  public getWorkspaces(): Workspace[] {
    try {
      return JSON.parse(fs.readFileSync(this.workspacesPath, 'utf8'));
    } catch {
      return [];
    }
  }

  public addWorkspace(name: string, absPath: string): Workspace {
    const workspaces = this.getWorkspaces();
    const resolved = path.resolve(absPath);
    const existing = workspaces.find((w) => path.resolve(w.path) === resolved);
    if (existing) return existing;

    const newWs: Workspace = {
      id: generateId('ws'),
      userId: 'user_dev_001',
      deviceId: this.getConfig().deviceId,
      name,
      path: resolved,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    workspaces.push(newWs);
    fs.writeFileSync(this.workspacesPath, JSON.stringify(workspaces, null, 2));
    return newWs;
  }

  public getPairingCode(): { formatted: string; expiresAt: number } {
    const now = Date.now();
    if (!this.currentPairingCode || this.currentPairingCode.expiresAt <= now) {
      const { formatted, raw } = generatePairingCode();
      this.currentPairingCode = {
        code: formatted,
        raw,
        expiresAt: now + 5 * 60 * 1000, // 5 min TTL
      };
    }
    return { formatted: this.currentPairingCode.code, expiresAt: this.currentPairingCode.expiresAt };
  }

  public verifyPairingCode(enteredCode: string): string | null {
    const clean = enteredCode.replace(/\s+/g, '');
    const now = Date.now();
    if (this.currentPairingCode && this.currentPairingCode.raw === clean && this.currentPairingCode.expiresAt > now) {
      const token = generateToken(32);
      this.pairedTokens.add(token);
      this.currentPairingCode = null; // consume code
      return token;
    }
    return null;
  }

  public isTokenValid(token: string): boolean {
    return this.pairedTokens.has(token);
  }
}
