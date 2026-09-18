# RemoteDev Development Guide

## Monorepo Layout

```
remotedev/
├── apps/
│   ├── android/              # Jetpack Compose Android Application
│   └── laptop-agent/         # Node.js/TypeScript Windows Laptop Agent
├── services/
│   └── backend/              # Fastify/Express Cloud Backend & WebSocket Relay
├── packages/
│   ├── types/                # Shared TypeScript types & interfaces
│   ├── protocol/             # Protocol message definitions & envelopes
│   ├── sync-engine/          # Synchronization logic, versioning & conflict detector
│   └── shared-utils/         # Security validation, path sanitizers & loggers
├── database/
│   ├── migrations/           # SQL migration scripts (PostgreSQL & SQLite)
│   └── seed/                 # Development sample seeds
├── docs/                     # Comprehensive architecture and design documentation
├── README.md
├── ARCHITECTURE.md
├── SECURITY.md
├── SYNC_PROTOCOL.md
└── DEVELOPMENT.md
```

## Prerequisites

- **Node.js**: v18+ (tested on v24)
- **npm**: v9+ (tested on v11)
- **Java / JDK**: OpenJDK 17+
- **Android SDK**: API 34 platform & command-line tools
- **Git**: 2.30+ installed locally

## Quick Start (Local Setup)

### 1. Install Dependencies
```powershell
npm install
```

### 2. Build Monorepo Packages
```powershell
npm run build
```

### 3. Start Backend Service
```powershell
npm run start:backend
```
Backend starts on `http://localhost:4000` with WebSocket endpoint `ws://localhost:4000/ws`.

### 4. Start Laptop Agent
```powershell
npm run start:agent
```
The Windows agent initializes on `ws://localhost:8765`, displays pairing codes, watches approved workspace directories, and connects to the backend relay.

### 5. Build Android Client
```powershell
cd apps/android
./gradlew assembleDebug
```
The APK is generated at `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
Install onto device/emulator:
```powershell
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
```
