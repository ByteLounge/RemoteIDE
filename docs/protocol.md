# RemoteDev WebSocket Protocol Specification

## Protocol Overview

The RemoteDev protocol utilizes JSON-encoded WebSocket frames for bidirectional real-time communication between the Android Client, the Cloud Relay, and the Laptop Agent.

Each message adheres to a standard envelop:

```json
{
  "id": "msg_01HXYZ1234567890",
  "type": "file.read",
  "source": "android_client_id",
  "target": "laptop_agent_id",
  "timestamp": 1726654800000,
  "payload": { ... }
}
```

Responses acknowledge the initiating message ID via `requestId` or `correlationId`:

```json
{
  "id": "msg_01HXYZ1234567891",
  "type": "file.read.response",
  "requestId": "msg_01HXYZ1234567890",
  "success": true,
  "payload": {
    "version": 12,
    "content": "export const greeting = 'Hello, RemoteDev';"
  }
}
```

## Standard Error Response

```json
{
  "id": "msg_error_123",
  "type": "error",
  "requestId": "msg_01HXYZ1234567890",
  "success": false,
  "error": {
    "code": "BASE_VERSION_MISMATCH",
    "message": "The file was modified on another device.",
    "details": {
      "expectedVersion": 12,
      "actualVersion": 13,
      "conflictId": "cnf_98765"
    }
  }
}
```

## Core Protocol Messages

### 1. Connection & Authentication
- `auth.handshake`: Sends client ID, auth token, and device capabilities.
- `auth.handshake.response`: Returns authentication status, assigned session, and connection topology (`DIRECT` or `RELAY`).
- `device.pair.request`: Initiates 6-digit PIN pairing exchange.
- `device.pair.response`: Validates PIN and establishes paired cryptographic keypair/tokens.

### 2. Workspace & Files
- `workspace.list`: Request list of approved developer directories on laptop.
- `workspace.list.response`: List of authorized workspace IDs, paths, and names.
- `file.list`: Directory traversal within workspace boundary.
- `file.read`: Read file content, returning version number, hash, and content.
- `file.write`: Write/save full file or atomic delta.
- `file.create`: Create file or directory.
- `file.delete`: Delete file or directory.
- `file.rename`: Rename or move item within authorized root.
- `file.search`: Safe recursive search query by filename or text.
- `file.watch.event`: Watcher notification broadcast when a file changes on disk.

### 3. Synchronization
- `sync.push_operations`: Transmits batch of local operations from Android or Laptop.
- `sync.push_operations.response`: Returns list of accepted sequence numbers, duplicate acks, or conflicts.
- `sync.pull_operations`: Requests operations since a given sequence number.
- `sync.conflict_resolve`: Submits user decision (`KEEP_LAPTOP`, `KEEP_PHONE`, or `MERGE`).

### 4. Terminal (PowerShell PTY)
- `terminal.create`: Spawns a persistent PowerShell session (with cwd and initial dimensions).
- `terminal.create.response`: Returns `sessionId` and initial prompt info.
- `terminal.input`: Sends keystrokes, commands (`\r`), or control sequences (e.g. `\x03` for Ctrl+C).
- `terminal.output`: Streams real-time stdout/stderr bytes/strings.
- `terminal.resize`: Updates rows and columns.
- `terminal.close`: Terminates the PTY process.

### 5. Processes
- `process.list`: Returns active RemoteDev-managed dev servers (PID, command, port, status).
- `process.start`: Starts background command (e.g., `npm run dev`).
- `process.stop`: Gracefully stops or kills a running process.
- `process.logs`: Streams process output log history.

### 6. Git Operations
- `git.status`: Returns branch name, ahead/behind count, staged, unstaged, untracked files.
- `git.diff`: Returns unified diff for a specific file or all unstaged changes.
- `git.stage` / `git.unstage`: Stages or unstages files.
- `git.commit`: Creates commit with message.
- `git.push` / `git.pull`: Syncs with remote repository.

### 7. AI Agent (CLI Orchestrator)
- `ai.session.start`: Initializes CLI agent session (Claude Code, Gemini CLI, Generic).
- `ai.session.prompt`: Sends prompt from user to agent.
- `ai.session.output`: Streams chunks of agent reasoning, tool calls, and responses.
- `ai.session.stop`: Aborts running agent task.
