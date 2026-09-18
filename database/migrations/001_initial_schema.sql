-- RemoteDev Initial Database Migration Schema
-- Compatible with PostgreSQL and SQLite

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(64) NOT NULL,
    platform VARCHAR(64) NOT NULL,
    agent_version VARCHAR(64),
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS pairing_codes (
    code VARCHAR(16) PRIMARY KEY,
    laptop_device_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    description TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_device_id ON workspaces(device_id);

CREATE TABLE IF NOT EXISTS workspace_devices (
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    is_synced_offline BOOLEAN DEFAULT FALSE,
    last_sync_sequence BIGINT DEFAULT 0,
    PRIMARY KEY (workspace_id, device_id)
);

CREATE TABLE IF NOT EXISTS file_metadata (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    content_hash VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    UNIQUE (workspace_id, path)
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_workspace_path ON file_metadata(workspace_id, path);

CREATE TABLE IF NOT EXISTS sync_operations (
    operation_id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    operation_type VARCHAR(64) NOT NULL,
    base_version BIGINT NOT NULL,
    payload TEXT NOT NULL,
    sequence_number BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_workspace_id ON sync_operations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_device_id ON sync_operations(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_sequence ON sync_operations(sequence_number);
CREATE INDEX IF NOT EXISTS idx_sync_ops_created_at ON sync_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_ops_status ON sync_operations(status);

CREATE TABLE IF NOT EXISTS terminal_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    shell VARCHAR(64) NOT NULL,
    cwd TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_terminal_workspace ON terminal_sessions(workspace_id);

CREATE TABLE IF NOT EXISTS processes (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    pid INTEGER,
    port INTEGER,
    status VARCHAR(32) NOT NULL,
    started_at BIGINT NOT NULL,
    stopped_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_processes_workspace ON processes(workspace_id);

CREATE TABLE IF NOT EXISTS connection_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    connection_type VARCHAR(32) NOT NULL, -- DIRECT or RELAY
    started_at BIGINT NOT NULL,
    ended_at BIGINT
);
