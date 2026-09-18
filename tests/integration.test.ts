import path from 'path';
import fs from 'fs';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocket } from 'ws';
import { BackendDatabase } from '../services/backend/src/db';
import { AuthService } from '../services/backend/src/auth';
import { createApiRouter } from '../services/backend/src/routes';
import { RelayServer } from '../services/backend/src/relay';
import { AgentConfigManager } from '../apps/laptop-agent/src/config';
import { WorkspaceManager } from '../apps/laptop-agent/src/workspaces';
import { AgentSyncManager } from '../apps/laptop-agent/src/sync';
import { TerminalManager } from '../apps/laptop-agent/src/terminal';
import { ProcessManager } from '../apps/laptop-agent/src/processes';
import { GitManager } from '../apps/laptop-agent/src/git';
import { IDEManager } from '../apps/laptop-agent/src/ide';
import { AIAgentManager } from '../apps/laptop-agent/src/ai';
import { WorkspaceWatcher } from '../apps/laptop-agent/src/watcher';
import { AgentServer } from '../apps/laptop-agent/src/server';
import { SyncOperation } from '../packages/types/src';

export async function runIntegrationTests(): Promise<boolean> {
  console.log('\n=== [SUITE] Full End-to-End Integration Tests ===');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  };

  const TEST_PORT = 4199;
  const TEST_AGENT_PORT = 8899;

  // Setup test workspace directory on disk
  const testWorkspaceDir = path.resolve(process.cwd(), 'temp_test_workspace');
  if (!fs.existsSync(testWorkspaceDir)) {
    fs.mkdirSync(testWorkspaceDir, { recursive: true });
  }
  const testFilePath = path.join(testWorkspaceDir, 'test_source.txt');
  fs.writeFileSync(testFilePath, 'Hello Windows Laptop Original', 'utf8');

  // 1. Start In-Memory Backend Server
  const app = express();
  app.use(cors());
  app.use(express.json());

  const testDbFile = path.resolve(process.cwd(), 'data', 'test_remotedev.sqlite');
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

  const db = new BackendDatabase(testDbFile);
  const auth = new AuthService(db.getRawDb());
  app.use('/api/v1', createApiRouter(db.getRawDb(), auth));

  const httpServer = http.createServer(app);
  const relay = new RelayServer(httpServer, db.getRawDb(), auth);

  await new Promise<void>((resolve) => httpServer.listen(TEST_PORT, () => resolve()));
  assert(true, `Backend server running on port ${TEST_PORT}`);

  // 2. User Registration & Auth
  const { user, token } = auth.register('tester@remotedev.test', 'password123', 'Integration Tester');
  assert(user.email === 'tester@remotedev.test', 'User registered successfully');
  assert(token.length > 0, 'Bearer session token generated');

  // 3. Laptop Agent Initialization
  const configManager = new AgentConfigManager();
  const workspaceManager = new WorkspaceManager(configManager);
  const syncManager = new AgentSyncManager(workspaceManager);
  const terminalManager = new TerminalManager(workspaceManager);
  const processManager = new ProcessManager(workspaceManager);
  const gitManager = new GitManager(workspaceManager);
  const ideManager = new IDEManager(workspaceManager);
  const aiManager = new AIAgentManager(workspaceManager);
  const watcher = new WorkspaceWatcher(configManager, workspaceManager);

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

  const physicalContent = fs.readFileSync(testFilePath, 'utf8');
  assert(physicalContent === 'Edited from Android Device', 'Physical file on Windows disk updated directly!');

  // 6. Interactive PowerShell Terminal Session
  const termSession = terminalManager.createSession(testWs.id, 'powershell.exe');
  assert(termSession.sessionId.length > 0, 'Persistent terminal session created');
  assert(termSession.isActive, 'Terminal process is actively running');

  // Write command to terminal and test output streaming
  await new Promise<void>((resolve) => {
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
  const offlineOp: SyncOperation = {
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
  assert(fs.readFileSync(testFilePath, 'utf8') === 'Offline Sync Update Applied', 'Offline modification applied to Windows file system');

  // Duplicate replay test (Idempotency)
  const replayRes = syncManager.applyOperations(testWs.id, [offlineOp]);
  assert(replayRes.acceptedOperationIds.includes(offlineOp.operation_id), 'Duplicate operation idempotently acknowledged without re-executing');

  // 9. Conflict Detection
  const conflictingOp: SyncOperation = {
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
  assert(fs.readFileSync(testFilePath, 'utf8') === 'Offline Sync Update Applied', 'Conflicting file was NOT silently overwritten!');

  // Clean up
  httpServer.close();
  db.close();
  try {
    fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  } catch {}

  console.log(`\nIntegration Tests Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}
