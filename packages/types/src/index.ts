/**
 * RemoteDev Shared Type Definitions
 */

export type ConnectionState = 'DIRECT' | 'RELAY' | 'OFFLINE' | 'RECONNECTING';

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export type DeviceType = 'WINDOWS_LAPTOP' | 'ANDROID_PHONE' | 'LINUX_WORKSTATION' | 'MACOS_LAPTOP';

export interface Device {
  id: string;
  userId: string;
  name: string;
  deviceType: DeviceType;
  platform: string;
  isOnline: boolean;
  lastSeenAt: string;
  ipAddress?: string;
  agentVersion?: string;
}

export interface Workspace {
  id: string;
  userId: string;
  deviceId: string; // The primary host device (e.g. laptop)
  name: string;
  path: string;     // Canonical local absolute path on host
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDevice {
  workspaceId: string;
  deviceId: string;
  isSyncedOffline: boolean;
  lastSyncSequence: number;
}

// ---------------------------------------------------------------------------
// Filesystem & Explorer Types
// ---------------------------------------------------------------------------

export type FileType = 'file' | 'directory';

export interface FileItem {
  name: string;
  path: string; // Relative to workspace root, normalized with forward slashes
  type: FileType;
  size?: number;
  modifiedTime?: number;
  extension?: string;
  children?: FileItem[];
}

export interface FileContent {
  path: string;
  content: string;
  version: number;
  hash: string;
  encoding?: 'utf-8' | 'base64';
}

// ---------------------------------------------------------------------------
// Operation-based Synchronization Types
// ---------------------------------------------------------------------------

export type OperationType =
  | 'CREATE_FILE'
  | 'DELETE_FILE'
  | 'RENAME_FILE'
  | 'WRITE_FILE'
  | 'INSERT_TEXT'
  | 'DELETE_TEXT'
  | 'REPLACE_TEXT';

export type SyncStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'ACKNOWLEDGED'
  | 'CONFLICT'
  | 'FAILED';

export interface SyncOperation {
  operation_id: string;
  workspace_id: string;
  device_id: string;
  file_path: string;
  operation_type: OperationType;
  base_version: number;
  payload: string; // JSON string or raw text content depending on operation
  created_at: number;
  sequence_number: number;
  status: SyncStatus;
}

export interface ConflictInfo {
  conflict_id: string;
  operation_id: string;
  workspace_id: string;
  file_path: string;
  expected_version: number;
  actual_version: number;
  laptop_content: string;
  phone_content: string;
  detected_at: number;
}

export type ConflictResolutionChoice = 'KEEP_LAPTOP' | 'KEEP_PHONE' | 'MANUAL_MERGE';

export interface ConflictResolution {
  conflict_id: string;
  choice: ConflictResolutionChoice;
  merged_content?: string;
}

// ---------------------------------------------------------------------------
// Terminal Types
// ---------------------------------------------------------------------------

export interface TerminalSession {
  sessionId: string;
  workspaceId: string;
  shell: string; // e.g. 'powershell.exe'
  cwd: string;
  title: string;
  createdAt: number;
  isActive: boolean;
}

export interface TerminalResize {
  cols: number;
  rows: number;
}

// ---------------------------------------------------------------------------
// Process Management Types
// ---------------------------------------------------------------------------

export type ProcessStatus = 'RUNNING' | 'STOPPED' | 'FAILED' | 'RESTARTING';

export interface ProcessInfo {
  id: string;
  workspaceId: string;
  command: string;
  args?: string[];
  pid?: number;
  port?: number;
  status: ProcessStatus;
  startedAt: number;
  exitCode?: number;
}

export interface ProcessLogEntry {
  processId: string;
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Git Types
// ---------------------------------------------------------------------------

export type GitStatusChar = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!' | ' ';

export interface GitFileStatus {
  path: string;
  stagedStatus?: GitStatusChar;
  unstagedStatus?: GitStatusChar;
  isStaged: boolean;
  isUntracked: boolean;
}

export interface GitStatusResult {
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  clean: boolean;
}

export interface GitDiffResult {
  path?: string;
  diff: string;
}

// ---------------------------------------------------------------------------
// AI Agent Integration Types
// ---------------------------------------------------------------------------

export type AIAgentType = 'ClaudeCode' | 'GeminiCLI' | 'CodexCLI' | 'Ollama' | 'GenericCLI';

export interface AIAgentSession {
  sessionId: string;
  agentType: AIAgentType;
  workspaceId: string;
  isActive: boolean;
  startedAt: number;
}

export interface AIAgentChunk {
  sessionId: string;
  chunk: string;
  kind: 'thinking' | 'tool_call' | 'response' | 'error';
  timestamp: number;
}

// ---------------------------------------------------------------------------
// System Diagnostics & Pairing
// ---------------------------------------------------------------------------

export interface SystemStats {
  cpuUsagePercent: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
  osPlatform: string;
  uptimeSeconds: number;
  agentVersion: string;
}

export interface PairingSession {
  code: string; // 6 digit PIN (e.g. 742 193)
  laptopDeviceId: string;
  expiresAt: number;
  createdAt: number;
}
