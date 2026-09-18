"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLaptopAgent = startLaptopAgent;
const config_1 = require("./config");
const workspaces_1 = require("./workspaces");
const sync_1 = require("./sync");
const terminal_1 = require("./terminal");
const processes_1 = require("./processes");
const git_1 = require("./git");
const ide_1 = require("./ide");
const ai_1 = require("./ai");
const watcher_1 = require("./watcher");
const server_1 = require("./server");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('AgentMain');
function startLaptopAgent() {
    const configManager = new config_1.AgentConfigManager();
    const workspaceManager = new workspaces_1.WorkspaceManager(configManager);
    const syncManager = new sync_1.AgentSyncManager(workspaceManager);
    const terminalManager = new terminal_1.TerminalManager(workspaceManager);
    const processManager = new processes_1.ProcessManager(workspaceManager);
    const gitManager = new git_1.GitManager(workspaceManager);
    const ideManager = new ide_1.IDEManager(workspaceManager);
    const aiManager = new ai_1.AIAgentManager(workspaceManager);
    const watcher = new watcher_1.WorkspaceWatcher(configManager, workspaceManager);
    const server = new server_1.AgentServer(configManager, workspaceManager, syncManager, terminalManager, processManager, gitManager, ideManager, aiManager, watcher);
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
