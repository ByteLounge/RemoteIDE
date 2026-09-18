# RemoteDev: Cross-Device Remote Development Workspace

RemoteDev is a production-quality synchronized development-control layer between an **Android phone** and a **Windows laptop**. It allows developers to control and continue their laptop development environment seamlessly from their mobile device without attempting to replace VS Code, Antigravity, or Claude Code.

```text
                    RemoteDev
                       |
          +------------+-------------+
          |                          |
     Android Client            Laptop Agent
          |                          |
          |                    +-----+------+
          |                    |            |
          |                 Filesystem   Terminal
          |                    |            |
          |                 Git/IDE/CLI   Processes
          |
          +---------- Cloud Sync ----------+
```

---

## Key Features

1. **Laptop as Primary Source of Truth**: When the laptop agent is online, mobile operations sync with low latency directly or via cloud relay without uploading entire repositories.
2. **Operation-Based Synchronization**: Changes are applied via an idempotent operation log (`CREATE_FILE`, `DELETE_FILE`, `RENAME_FILE`, `WRITE_FILE`, `INSERT_TEXT`, `DELETE_TEXT`, `REPLACE_TEXT`) with monotonically increasing sequence numbers.
3. **Resilient Offline Mode & Conflict Resolution**: Android persists changes locally in Room/SQLite when offline. Reconnection applies operations safely. If a file was modified concurrently on the laptop, `BASE_VERSION_MISMATCH` is raised, allowing the user to view the diff and select `Keep Laptop`, `Keep Phone`, or `Merge Manually`.
4. **Interactive Terminal**: Streaming PowerShell PTY with full ANSI support, real-time command input/output, Ctrl+C interrupt, clear, and reconnectable persistent sessions.
5. **Development Process Manager**: Start, monitor, view logs, restart, and stop background development processes (e.g. `npm run dev`, `python server.py`) initiated through RemoteDev.
6. **Git Integration**: View branch info, staged/unstaged/untracked changes, inspect unified diffs, stage/unstage files, commit changes, push, and pull directly via the local laptop Git executable.
7. **AI Coding Assistant Bridge**: Local execution interface for CLI AI coding tools (Claude Code, Gemini CLI, Generic CLI) with real-time mobile output streaming.
8. **Security & Workspace Isolation**: Strict path traversal prevention, 6-digit ephemeral pairing codes (5-minute TTL), token-based authorization, and automatic secret exclusion (`.env`, private keys).

---

## Monorepo Architecture

```text
remotedev/
├── apps/
│   ├── android/              # Jetpack Compose Android Client (Kotlin, Material 3, Room, WebSockets)
│   └── laptop-agent/         # Windows Laptop Service (Node.js/TypeScript, PowerShell PTY, Watchers)
├── services/
│   └── backend/              # Cloud Backend & WebSocket Relay (Fastify/Express, Auth, Sync, Presence)
├── packages/
│   ├── types/                # Shared TypeScript types & data models
│   ├── protocol/             # WebSocket message definitions, validation, and error codes
│   ├── sync-engine/          # Operation log applicator, sequence numbers & conflict detector
│   └── shared-utils/         # Safe path resolution, hashing, tokens, structured logging
├── database/
│   ├── migrations/           # PostgreSQL & SQLite migrations
│   └── seed/                 # Development sample seed data
├── docs/
│   ├── architecture.md       # Architectural deep-dive and component topology
│   ├── protocol.md           # Wire protocol and message catalog
│   ├── sync.md               # Sync engine mechanics and conflict handling
│   ├── security.md           # Threat model, sandboxing, and security controls
│   └── development.md        # Comprehensive developer guide
├── ARCHITECTURE.md
├── SECURITY.md
├── SYNC_PROTOCOL.md
├── DEVELOPMENT.md
├── .env.example
└── README.md
```

---

## Quick Start & Local Setup

### Prerequisites
- **Node.js**: v18 or higher (v24 recommended)
- **npm**: v9 or higher (v11 recommended)
- **Java / JDK**: OpenJDK 17 or higher
- **Android SDK**: API 34+
- **Git**: 2.30+

### 1. Monorepo Installation & Build
```powershell
# Install all dependencies across workspaces
npm install

# Build all shared packages and services
npm run build
```

### 2. Start Cloud Backend
```powershell
# Starts the backend on http://localhost:4000 (WebSocket: ws://localhost:4000/ws)
npm run start:backend
```

### 3. Start Windows Laptop Agent
```powershell
# Starts the laptop agent service (Local port: 8765, relays to backend)
npm run start:agent
```
On initial boot, the laptop agent prints a secure 6-digit pairing code (valid for 5 minutes).

### 4. Build and Install Android APK
```powershell
cd apps/android
./gradlew assembleDebug
```
The compiled APK will be at `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
Install onto your connected phone or emulator:
```powershell
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Configuration & Environment Variables

Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Backend HTTP & WebSocket port | `4000` |
| `JWT_SECRET` | Secret key for signing session tokens | Secure random string |
| `DATABASE_URL` | SQLite file path or PostgreSQL URI | `file:./data/remotedev.sqlite` |
| `AGENT_PORT` | Laptop Agent local WebSocket port | `8765` |
| `CLOUD_RELAY_URL`| WebSocket endpoint for cloud relay | `ws://localhost:4000/ws` |
| `CLOUD_API_URL` | REST endpoint for cloud backend | `http://localhost:4000/api/v1` |

---

## Primary Verification Workflows

1. **Device Pairing**: Launch Android client, tap "Pair New Device", enter the 6-digit code shown on the laptop agent terminal.
2. **Workspace Browsing & File Editing**: Select an authorized project, navigate folders, open any source file, edit, and tap Save. Verify the file changes on the Windows disk instantly.
3. **Terminal Execution**: Switch to Terminal tab, run `git status` or `dir`, see real-time streaming output, press Ctrl+C to interrupt.
4. **Offline Synchronization**: Turn off Wi-Fi on laptop or disconnect laptop agent. Make changes on Android. Verify the changes are queued with status `PENDING`. Reconnect laptop; observe automatic flush and acknowledgement.
5. **Conflict Handling**: Modify the same file line concurrently on Windows and Android. Trigger sync; verify the Android screen displays a conflict dialog with `Keep Laptop`, `Keep Phone`, and `Merge Manually` options.

---

## License
MIT License.
