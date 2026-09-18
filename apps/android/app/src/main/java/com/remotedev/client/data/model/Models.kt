package com.remotedev.client.data.model

import com.google.gson.annotations.SerializedName

enum class ConnectionState {
    DIRECT, RELAY, OFFLINE, RECONNECTING
}

data class User(
    val id: String,
    val email: String,
    val name: String? = null
)

data class Device(
    val id: String,
    val name: String,
    @SerializedName("deviceType") val deviceType: String,
    val platform: String,
    @SerializedName("isOnline") val isOnline: Boolean = false,
    @SerializedName("lastSeenAt") val lastSeenAt: String? = null,
    @SerializedName("agentVersion") val agentVersion: String? = null
)

data class Workspace(
    val id: String,
    val name: String,
    val path: String,
    val description: String? = null
)

data class FileItem(
    val name: String,
    val path: String,
    val type: String, // "file" or "directory"
    val size: Long? = null,
    val modifiedTime: Long? = null,
    val extension: String? = null,
    val children: List<FileItem>? = null
)

data class FileContent(
    val path: String,
    val content: String,
    val version: Long = 1,
    val hash: String = ""
)

data class SyncOperation(
    val operation_id: String,
    val workspace_id: String,
    val device_id: String,
    val file_path: String,
    val operation_type: String, // CREATE_FILE, WRITE_FILE, DELETE_FILE, RENAME_FILE, etc.
    val base_version: Long,
    val payload: String,
    val created_at: Long = System.currentTimeMillis(),
    val sequence_number: Long = 0,
    val status: String = "PENDING" // PENDING, UPLOADING, ACKNOWLEDGED, CONFLICT, FAILED
)

data class ConflictInfo(
    val conflict_id: String,
    val operation_id: String,
    val workspace_id: String,
    val file_path: String,
    val expected_version: Long,
    val actual_version: Long,
    val laptop_content: String,
    val phone_content: String,
    val detected_at: Long
)

data class TerminalSession(
    val sessionId: String,
    val workspaceId: String,
    val shell: String,
    val cwd: String,
    val title: String? = null,
    val isActive: Boolean = true
)

data class ProcessInfo(
    val id: String,
    val workspaceId: String,
    val command: String,
    val pid: Int? = null,
    val port: Int? = null,
    val status: String = "RUNNING",
    val startedAt: Long = 0
)

data class ProcessLogEntry(
    val processId: String,
    val stream: String,
    val text: String,
    val timestamp: Long
)

data class GitFileStatus(
    val path: String,
    val stagedStatus: String? = null,
    val unstagedStatus: String? = null,
    val isStaged: Boolean = false,
    val isUntracked: Boolean = false
)

data class GitStatusResult(
    val branch: String = "main",
    val tracking: String? = null,
    val ahead: Int = 0,
    val behind: Int = 0,
    val files: List<GitFileStatus> = emptyList(),
    val clean: Boolean = true
)

data class SystemStats(
    val cpuUsagePercent: Int = 0,
    val totalMemoryBytes: Long = 0,
    val freeMemoryBytes: Long = 0,
    val diskTotalBytes: Long = 0,
    val diskFreeBytes: Long = 0,
    val osPlatform: String = "",
    val uptimeSeconds: Long = 0,
    val agentVersion: String = ""
)

data class AIAgentChunk(
    val sessionId: String,
    val chunk: String,
    val kind: String = "response", // thinking, tool_call, response, error
    val timestamp: Long = 0
)

data class ProtocolEnvelope<T>(
    val id: String,
    val type: String,
    val requestId: String? = null,
    val source: String? = null,
    val target: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val success: Boolean = true,
    val payload: T? = null
)
