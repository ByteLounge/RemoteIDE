"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIntegrationTests = runIntegrationTests;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = require("../services/backend/src/db");
const auth_1 = require("../services/backend/src/auth");
const routes_1 = require("../services/backend/src/routes");
const relay_1 = require("../services/backend/src/relay");
const config_1 = require("../apps/laptop-agent/src/config");
const workspaces_1 = require("../apps/laptop-agent/src/workspaces");
const sync_1 = require("../apps/laptop-agent/src/sync");
const terminal_1 = require("../apps/laptop-agent/src/terminal");
const processes_1 = require("../apps/laptop-agent/src/processes");
const git_1 = require("../apps/laptop-agent/src/git");
const ide_1 = require("../apps/laptop-agent/src/ide");
const ai_1 = require("../apps/laptop-agent/src/ai");
const watcher_1 = require("../apps/laptop-agent/src/watcher");
async function runIntegrationTests() {
    console.log('\n=== [SUITE] Full End-to-End Integration Tests ===');
    let passed = 0;
    let failed = 0;
    const assert = (condition, msg) => {
        if (condition) {
            console.log(`  ✓ ${msg}`);
            passed++;
        }
        else {
            console.error(`  ✗ FAIL: ${msg}`);
            failed++;
        }
    };
    const TEST_PORT = 4199;
    const TEST_AGENT_PORT = 8899;
    // Setup test workspace directory on disk
    const testWorkspaceDir = path_1.default.resolve(process.cwd(), 'temp_test_workspace');
    if (!fs_1.default.existsSync(testWorkspaceDir)) {
        fs_1.default.mkdirSync(testWorkspaceDir, { recursive: true });
    }
    const testFilePath = path_1.default.join(testWorkspaceDir, 'test_source.txt');
    fs_1.default.writeFileSync(testFilePath, 'Hello Windows Laptop Original', 'utf8');
    // 1. Start In-Memory Backend Server
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    const testDbFile = path_1.default.resolve(process.cwd(), 'data', 'test_remotedev.sqlite');
    if (fs_1.default.existsSync(testDbFile))
        fs_1.default.unlinkSync(testDbFile);
    const db = new db_1.BackendDatabase(testDbFile);
    const auth = new auth_1.AuthService(db.getRawDb());
    app.use('/api/v1', (0, routes_1.createApiRouter)(db.getRawDb(), auth));
    const httpServer = http_1.default.createServer(app);
    const relay = new relay_1.RelayServer(httpServer, db.getRawDb(), auth);
    await new Promise((resolve) => httpServer.listen(TEST_PORT, () => resolve()));
    assert(true, `Backend server running on port ${TEST_PORT}`);
    // 2. User Registration & Auth
    const { user, token } = auth.register('tester@remotedev.test', 'password123', 'Integration Tester');
    assert(user.email === 'tester@remotedev.test', 'User registered successfully');
    assert(token.length > 0, 'Bearer session token generated');
    // 3. Laptop Agent Initialization
    const configManager = new config_1.AgentConfigManager();
    const workspaceManager = new workspaces_1.WorkspaceManager(configManager);
    const syncManager = new sync_1.AgentSyncManager(workspaceManager);
    const terminalManager = new terminal_1.TerminalManager(workspaceManager);
    const processManager = new processes_1.ProcessManager(workspaceManager);
    const gitManager = new git_1.GitManager(workspaceManager);
    const ideManager = new ide_1.IDEManager(workspaceManager);
    const aiManager = new ai_1.AIAgentManager(workspaceManager);
    const watcher = new watcher_1.WorkspaceWatcher(configManager, workspaceManager);
    // Register the test workspace
    const testWs = configManager.addWorkspace('TestWorkspace', testWorkspaceDir);
    assert(testWs.name === 'TestWorkspace', 'Approved workspace added to agent config');
    // 4. Pairing Flow
    const pairing = configManager.getPairingCode();
    assert(pairing.formatted.length === 7, 'Pairing code generated formatted as 6 digits with space');
    const pairToken = configManager.verifyPairingCode(pairing.formatted);
    assert(pairToken !== null, 'Pairing code verified successfully by client');
    // 5. Filesystem Read & Write
    const readRes = workspaceManager.readFile(testWs.id, 'test_source.txt');
    assert(readRes.content === 'Hello Windows Laptop Original', 'Read initial file content from workspace');
    // Edit from mobile
    const writeRes = workspaceManager.writeFile(testWs.id, 'test_source.txt', 'Edited from Android Device', readRes.version);
    assert(writeRes.newVersion === 2, 'File version bumped to v2');
    const physicalContent = fs_1.default.readFileSync(testFilePath, 'utf8');
    assert(physicalContent === 'Edited from Android Device', 'Physical file on Windows disk updated directly!');
    // 6. Interactive PowerShell Terminal Session
    const termSession = terminalManager.createSession(testWs.id, 'powershell.exe');
    assert(termSession.sessionId.length > 0, 'Persistent terminal session created');
    assert(termSession.isActive, 'Terminal process is actively running');
    // Write command to terminal and test output streaming
    await new Promise((resolve) => {
        let outputReceived = false;
        terminalManager.setOutputListener(termSession.sessionId, (data) => {
            if (!outputReceived && data.length > 0) {
                outputReceived = true;
                assert(true, `Terminal streaming output received: "${data.trim().slice(0, 40)}..."`);
                resolve();
            }
        });
        terminalManager.writeInput(termSession.sessionId, 'dir\r');
    });
    terminalManager.killSession(termSession.sessionId);
    assert(!termSession.isActive, 'Terminal session terminated cleanly');
    // 7. Process Management
    const proc = processManager.startProcess(testWs.id, 'echo "RemoteDev Dev Server"');
    assert(proc.pid !== undefined && proc.pid > 0, 'Managed process spawned with valid PID');
    assert(proc.status === 'RUNNING', 'Process status marked RUNNING');
    // 8. Offline Queue & Synchronization
    const offlineOp = {
        operation_id: `op_offline_${Date.now()}`,
        workspace_id: testWs.id,
        device_id: 'dev_android_offline',
        file_path: 'test_source.txt',
        operation_type: 'WRITE_FILE',
        base_version: 2,
        payload: 'Offline Sync Update Applied',
        created_at: Date.now(),
        sequence_number: 1,
        status: 'PENDING',
    };
    // Agent receives queued operation upon reconnect
    const applyRes = syncManager.applyOperations(testWs.id, [offlineOp]);
    assert(applyRes.acceptedOperationIds.includes(offlineOp.operation_id), 'Offline operation accepted by laptop sync engine');
    assert(fs_1.default.readFileSync(testFilePath, 'utf8') === 'Offline Sync Update Applied', 'Offline modification applied to Windows file system');
    // Duplicate replay test (Idempotency)
    const replayRes = syncManager.applyOperations(testWs.id, [offlineOp]);
    assert(replayRes.acceptedOperationIds.includes(offlineOp.operation_id), 'Duplicate operation idempotently acknowledged without re-executing');
    // 9. Conflict Detection
    const conflictingOp = {
        operation_id: `op_conflict_${Date.now()}`,
        workspace_id: testWs.id,
        device_id: 'dev_android_conflict',
        file_path: 'test_source.txt',
        operation_type: 'WRITE_FILE',
        base_version: 1, // Stale version! (Current disk is v3)
        payload: 'Conflicting edit based on stale v1',
        created_at: Date.now(),
        sequence_number: 2,
        status: 'PENDING',
    };
    const conflictRes = syncManager.applyOperations(testWs.id, [conflictingOp]);
    assert(conflictRes.conflicts.length === 1, 'BASE_VERSION_MISMATCH conflict detected');
    assert(conflictRes.conflicts[0].expected_version === 3, 'Conflict identifies current version 3');
    assert(fs_1.default.readFileSync(testFilePath, 'utf8') === 'Offline Sync Update Applied', 'Conflicting file was NOT silently overwritten!');
    // Clean up
    httpServer.close();
    db.close();
    try {
        fs_1.default.rmSync(testWorkspaceDir, { recursive: true, force: true });
        if (fs_1.default.existsSync(testDbFile))
            fs_1.default.unlinkSync(testDbFile);
    }
    catch { }
    console.log(`\nIntegration Tests Result: ${passed} passed, ${failed} failed`);
    return failed === 0;
}
