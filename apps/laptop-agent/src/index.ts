import { AgentConfigManager } from './config';
import { WorkspaceManager } from './workspaces';
import { AgentSyncManager } from './sync';
import { TerminalManager } from './terminal';
import { ProcessManager } from './processes';
import { GitManager } from './git';
import { IDEManager } from './ide';
import { AIAgentManager } from './ai';
import { WorkspaceWatcher } from './watcher';
import { AgentServer } from './server';
import { createLogger } from '@remotedev/shared-utils';

const logger = createLogger('AgentMain');

export function startLaptopAgent() {
  const configManager = new AgentConfigManager();
  const workspaceManager = new WorkspaceManager(configManager);
  const syncManager = new AgentSyncManager(workspaceManager);
  const terminalManager = new TerminalManager(workspaceManager);
  const processManager = new ProcessManager(workspaceManager);
  const gitManager = new GitManager(workspaceManager);
  const ideManager = new IDEManager(workspaceManager);
  const aiManager = new AIAgentManager(workspaceManager);
  const watcher = new WorkspaceWatcher(configManager, workspaceManager);

  const server = new AgentServer(
    configManager,
    workspaceManager,
    syncManager,
    terminalManager,
    processManager,
    gitManager,
    ideManager,
    aiManager,
    watcher
  );

  const config = configManager.getConfig();
  const pairing = configManager.getPairingCode();
  const workspaces = configManager.getWorkspaces();

  console.log(`
============================================================
              RemoteDev Laptop Agent v${config.agentVersion}
============================================================
  Device ID:    ${config.deviceId}
  Device Name:  ${config.deviceName}
  Direct Port:  ${config.port}
  Relay URL:    ${config.relayUrl}
------------------------------------------------------------
  PAIRING CODE: [ ${pairing.formatted} ]
  (Expires in 5 minutes - Enter this on your Android device)
------------------------------------------------------------
  Approved Workspaces:
${workspaces.map((w) => `   - [${w.name}] ${w.path}`).join('\n')}
============================================================
`);

  server.start();

  return { server, configManager, workspaceManager, syncManager };
}

if (require.main === module) {
  startLaptopAgent();
}
