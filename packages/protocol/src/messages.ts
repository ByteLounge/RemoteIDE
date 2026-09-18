import {
  FileItem,
  FileContent,
  SyncOperation,
  ConflictInfo,
  TerminalSession,
  TerminalResize,
  ProcessInfo,
  ProcessLogEntry,
  GitStatusResult,
  GitDiffResult,
  SystemStats,
  AIAgentType,
  AIAgentChunk,
  Workspace,
  Device,
  ConflictResolutionChoice,
} from '@remotedev/types';
import { ProtocolErrorDetail } from './errors';

export interface ProtocolEnvelope<T = unknown> {
  id: string;
  type: string;
  requestId?: string;
  source?: string;
  target?: string;
  timestamp: number;
  success?: boolean;
  error?: ProtocolErrorDetail;
  payload?: T;
}

// ---------------------------------------------------------------------------
// Auth & Pairing
// ---------------------------------------------------------------------------

export interface AuthHandshakePayload {
  deviceId: string;
  deviceType: string;
  token?: string;
  agentVersion?: string;
}

export interface AuthHandshakeResponsePayload {
  authenticated: boolean;
  sessionId: string;
  device: Device;
  topology: 'DIRECT' | 'RELAY';
}

export interface DevicePairPayload {
  code: string; // 6-digit PIN
  deviceName: string;
  deviceType: string;
}

export interface DevicePairResponsePayload {
  paired: boolean;
  deviceId: string;
  token: string;
  laptopName: string;
}

// ---------------------------------------------------------------------------
// Workspaces & Files
// ---------------------------------------------------------------------------

export interface WorkspaceListResponsePayload {
  workspaces: Workspace[];
}

export interface FileListRequestPayload {
  workspaceId: string;
  path?: string; // Relative path, empty or '/' for root
  recursive?: boolean;
}

export interface FileListResponsePayload {
  workspaceId: string;
  path: string;
  items: FileItem[];
}

export interface FileReadRequestPayload {
  workspaceId: string;
  path: string;
}

export interface FileReadResponsePayload {
  workspaceId: string;
  file: FileContent;
}

export interface FileWriteRequestPayload {
  workspaceId: string;
  path: string;
  content: string;
  baseVersion: number;
  operationId?: string;
}

export interface FileWriteResponsePayload {
  workspaceId: string;
  path: string;
  newVersion: number;
  hash: string;
}

export interface FileCreateRequestPayload {
  workspaceId: string;
  path: string;
  type: 'file' | 'directory';
  initialContent?: string;
}

export interface FileDeleteRequestPayload {
  workspaceId: string;
  path: string;
}

export interface FileRenameRequestPayload {
  workspaceId: string;
  oldPath: string;
  newPath: string;
}

export interface FileSearchRequestPayload {
  workspaceId: string;
  query: string;
  isRegex?: boolean;
}

export interface FileSearchResponsePayload {
  workspaceId: string;
  results: { path: string; line?: number; matchSnippet?: string }[];
}

export interface FileWatchEventPayload {
  workspaceId: string;
  path: string;
  event: 'created' | 'modified' | 'deleted' | 'renamed';
  newVersion?: number;
  sourceDeviceId?: string;
}

// ---------------------------------------------------------------------------
// Sync Engine
// ---------------------------------------------------------------------------

export interface SyncPushOperationsPayload {
  workspaceId: string;
  deviceId: string;
  operations: SyncOperation[];
}

export interface SyncPushOperationsResponsePayload {
  acceptedOperationIds: string[];
  conflicts: ConflictInfo[];
  currentSequenceNumber: number;
}

export interface SyncPullOperationsPayload {
  workspaceId: string;
  sinceSequence: number;
}

export interface SyncPullOperationsResponsePayload {
  operations: SyncOperation[];
  latestSequenceNumber: number;
}

export interface SyncConflictResolvePayload {
  conflictId: string;
  workspaceId: string;
  choice: ConflictResolutionChoice;
  mergedContent?: string;
}

export interface SyncConflictResolveResponsePayload {
  resolved: boolean;
  newVersion: number;
  path: string;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export interface TerminalCreateRequestPayload {
  workspaceId: string;
  shell?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalCreateResponsePayload {
  sessionId: string;
  workspaceId: string;
  shell: string;
  cwd: string;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string; // text or escape seq, e.g. "\x03" for Ctrl+C
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalKillPayload {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Process Manager
// ---------------------------------------------------------------------------

export interface ProcessStartRequestPayload {
  workspaceId: string;
  command: string;
  args?: string[];
}

export interface ProcessStopRequestPayload {
  processId: string;
}

export interface ProcessRestartRequestPayload {
  processId: string;
}

export interface ProcessListResponsePayload {
  workspaceId?: string;
  processes: ProcessInfo[];
}

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

export interface GitStatusRequestPayload {
  workspaceId: string;
}

export interface GitStatusResponsePayload {
  workspaceId: string;
  status: GitStatusResult;
}

export interface GitDiffRequestPayload {
  workspaceId: string;
  path?: string;
}

export interface GitDiffResponsePayload {
  workspaceId: string;
  diff: string;
}

export interface GitStageRequestPayload {
  workspaceId: string;
  paths: string[];
}

export interface GitUnstageRequestPayload {
  workspaceId: string;
  paths: string[];
}

export interface GitCommitRequestPayload {
  workspaceId: string;
  message: string;
}

export interface GitCommitResponsePayload {
  workspaceId: string;
  commitHash: string;
  summary: string;
}

export interface GitSyncRequestPayload {
  workspaceId: string;
  remote?: string;
  branch?: string;
}

// ---------------------------------------------------------------------------
// AI Agent Orchestrator
// ---------------------------------------------------------------------------

export interface AIAgentStartRequestPayload {
  workspaceId: string;
  agentType: AIAgentType;
  prompt: string;
}

export interface AIAgentStopRequestPayload {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Diagnostics & Stats
// ---------------------------------------------------------------------------

export interface SystemStatsResponsePayload {
  stats: SystemStats;
}
