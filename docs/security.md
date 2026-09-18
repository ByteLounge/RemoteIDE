# RemoteDev Security Architecture & Hardening

## Threat Model & Core Principles

RemoteDev provides remote development capabilities over mobile and desktop devices. Because it handles filesystem access and terminal execution, security controls are applied by default across all layers:

### 1. Workspace Isolation & Path Traversal Prevention
- The laptop agent NEVER permits access to arbitrary paths on the machine.
- Every workspace must be explicitly registered and approved by the user on the Windows laptop.
- Before every filesystem interaction (read, write, list, delete, rename, search):
  1. Paths are resolved using `path.resolve()`.
  2. Traversal tokens (`..`, null bytes `%00`, directory junctions) are rejected.
  3. The canonical target path MUST strictly start with the approved workspace root directory path.
  4. If validation fails, an immediate `PATH_TRAVERSAL_DENIED` security error is thrown and logged.

### 2. Device Pairing & Authentication
- Pairing uses an ephemeral, cryptographically random 6-digit PIN with a strict 5-minute time-to-live (TTL).
- Upon successful pairing, high-entropy device-specific authentication tokens are generated and stored locally.
- Tokens can be revoked at any time from either the laptop agent or cloud dashboard.
- Permanent static passwords are forbidden.

### 3. Terminal & Command Execution Boundaries
- Shell execution is strictly bounded: commands run in the context of the authorized workspace directory.
- Destructive commands (e.g. file wipes, rm -rf) trigger warnings.
- The cloud backend NEVER executes shell commands directly; it acts only as an encrypted signaling and message transport layer.

### 4. Credential Protection
- Git credentials and SSH keys on the laptop are never read or transmitted to the mobile client.
- Sensitive environment files (`.env`, `.env.local`, `.git/config`, `id_rsa`, `*.pem`) are excluded by default from automated indexing or synchronization.
- Structured logger redacts any keys, bearer tokens, or password strings from telemetry output.
