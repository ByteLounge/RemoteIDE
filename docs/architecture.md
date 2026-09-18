# RemoteDev System Architecture

## Overview

RemoteDev is a synchronized development-control layer bridging an Android mobile client, a Windows laptop agent, local project workspaces, interactive terminals, Git, and a cloud synchronization/relay service.

The architecture emphasizes:
1. **The Laptop as Primary Source of Truth**: When the laptop agent is connected, changes are applied directly to the local filesystem with low latency.
2. **Operation-Based Synchronization**: Changes are captured as atomic operation logs with monotonically increasing sequence numbers rather than whole-file uploads.
3. **Resilient Offline Mode**: Mobile edits are queued in an idempotent SQLite operations log and replayed upon reconnection with automated conflict detection (`BASE_VERSION_MISMATCH`).
4. **Interactive Remote Capabilities**: Streaming PowerShell/PTY terminals, process management, Git diffing and staging, and CLI AI agent orchestration (Claude Code, Gemini CLI, Generic CLI).

```
                      +-------------------+
                      |   Cloud Backend   |
                      | (Relay/Auth/Sync) |
                      +---------+---------+
                                |
             +------------------+------------------+
             |                                     |
   (Direct LAN / Relay)                   (Direct LAN / Relay)
             |                                     |
             v                                     v
   +--------------------+                +--------------------+
   |   Android Client   |                |    Laptop Agent    |
   |  (Jetpack Compose) |                | (TypeScript/Node)  |
   +--------------------+                +---------+----------+
             |                                     |
    +--------+--------+                   +--------+--------+
    |  Room Database  |                   | Local SQLite DB |
    |  - Cached Files |                   | - Workspaces    |
    |  - Pending Ops  |                   | - Paired Devices|
    +-----------------+                   +-----------------+
                                                   |
                             +---------------------+---------------------+
                             |                     |                     |
                             v                     v                     v
                      Filesystem & Git      Terminal (PTY)        CLI AI Agents
                      (Watchers / Ops)       (PowerShell)       (Claude / Gemini)
```

## Core Components

### 1. Android Client (`apps/android`)
- **UI Framework**: Modern declarative UI built with Jetpack Compose & Material 3.
- **Persistence**: Room database for storing metadata, cached workspace files for offline editing, and an uncommitted operation queue.
- **Network Layer**: OkHttp WebSocket client with dual-mode connectivity (`DIRECT` over LAN or `RELAY` via cloud) and exponential backoff reconnection.
- **Editor**: High-performance mobile code editor supporting line numbering, syntax highlighting, search/replace, undo/redo, and conflict resolution diff inspection.

### 2. Laptop Agent (`apps/laptop-agent`)
- **Runtime**: Node.js & TypeScript daemon running on Windows.
- **Filesystem Security**: Strict workspace path authorization to prevent traversal (`..` escape, junction/symlink escaping).
- **Filesystem Watcher**: File watching with echo-suppression to prevent recursive echo loops when applying mobile operations.
- **Terminal Engine**: Interactive PowerShell session manager with real-time bidirectional stdio streaming, Ctrl+C SIGINT handling, and session persistence.
- **Process Manager**: Tracks dev servers (`npm run dev`, `python app.py`) with PID tracking, port detection, and circular log buffers.
- **Git Engine**: Direct integration with local Git binary without transmitting credentials over the network.
- **AI Agent Runner**: Spawns CLI coding assistants locally (Claude Code, Gemini CLI, Generic) and streams back outputs.

### 3. Cloud Backend & Relay (`services/backend`)
- **API & WebSocket**: Fastify/Express server providing REST API (`/api/v1/*`) and WebSocket message router (`/ws`).
- **Data Persistence**: Schema compatible with PostgreSQL/Supabase and zero-dependency local SQLite.
- **Signaling & Relay**: Handles pairing handshakes, device presence, and message relays when NAT/firewalls block direct peer connection.
- **Operation Store**: Buffers offline operations when laptop is disconnected and forwards them immediately upon agent reconnection.

### 4. Shared Packages (`packages/*`)
- **`@remotedev/types`**: Shared TypeScript definitions and data interfaces.
- **`@remotedev/protocol`**: WebSocket message definitions, serialization, validation, and status codes.
- **`@remotedev/sync-engine`**: Operation log applicator, conflict detection (`BASE_VERSION_MISMATCH`), and sequence number management.
- **`@remotedev/shared-utils`**: Safe path sanitization, hashing, cryptographic tokens, and structured logging.
