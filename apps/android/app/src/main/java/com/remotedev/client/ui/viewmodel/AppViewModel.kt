package com.remotedev.client.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.remotedev.client.data.local.LocalDatabase
import com.remotedev.client.data.model.*
import com.remotedev.client.data.network.RemoteDevClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val localDb = LocalDatabase(application)
    val client = RemoteDevClient()

    // Navigation & Auth
    val currentScreen = MutableStateFlow("home")
    val currentUser = MutableStateFlow<User?>(User("user_dev_001", "developer@remotedev.local", "Lead Developer"))
    val devices = MutableStateFlow<List<Device>>(listOf(
        Device("dev_laptop_001", "My Windows Laptop", "WINDOWS_LAPTOP", "win32", true, null, "0.1.0")
    ))

    // Workspaces & Files
    val workspaces = MutableStateFlow<List<Workspace>>(emptyList())
    val currentWorkspace = MutableStateFlow<Workspace?>(null)
    val currentFolder = MutableStateFlow("")
    val fileItems = MutableStateFlow<List<FileItem>>(emptyList())
    val searchQuery = MutableStateFlow("")

    // Code Editor
    val currentFilePath = MutableStateFlow<String?>(null)
    val editorContent = MutableStateFlow("")
    val originalContent = MutableStateFlow("")
    val currentFileVersion = MutableStateFlow(1L)
    val isEditorDirty = MutableStateFlow(false)
    val editorSearchQuery = MutableStateFlow("")
    val editorReplaceQuery = MutableStateFlow("")

    // Sync & Conflicts
    val pendingSyncCount = MutableStateFlow(0)
    val activeConflict = MutableStateFlow<ConflictInfo?>(null)

    // Terminal
    val terminalSession = MutableStateFlow<TerminalSession?>(null)
    val terminalBuffer = MutableStateFlow("")
    val terminalHistory = MutableStateFlow<List<String>>(emptyList())

    // Processes
    val processes = MutableStateFlow<List<ProcessInfo>>(emptyList())

    // Git
    val gitStatus = MutableStateFlow<GitStatusResult>(GitStatusResult())
    val currentDiff = MutableStateFlow("")
    val gitCommitMessage = MutableStateFlow("")

    // AI Agent
    val aiAgentType = MutableStateFlow("GenericCLI") // ClaudeCode, GeminiCLI, GenericCLI
    val aiMessages = MutableStateFlow<List<Pair<String, String>>>(emptyList()) // Sender to text
    val aiInputPrompt = MutableStateFlow("")

    // System Stats
    val systemStats = MutableStateFlow(SystemStats())

    init {
        updatePendingSyncCount()

        // Listen for terminal output
        viewModelScope.launch {
            client.terminalOutputs.collect { (sessionId, data) ->
                terminalBuffer.value = terminalBuffer.value + data
            }
        }

        // Listen for AI chunks
        viewModelScope.launch {
            client.aiChunks.collect { chunk ->
                val current = aiMessages.value.toMutableList()
                if (current.isNotEmpty() && current.last().first == "Agent") {
                    val last = current.removeAt(current.size - 1)
                    current.add("Agent" to last.second + chunk.chunk)
                } else {
                    current.add("Agent" to chunk.chunk)
                }
                aiMessages.value = current
            }
        }

        // Listen for File Watch events
        viewModelScope.launch {
            client.fileWatchEvents.collect { (path, event) ->
                currentWorkspace.value?.let { ws ->
                    loadFiles(ws.id, currentFolder.value)
                }
            }
        }

        // Auto-connect client
        client.connect()
        refreshWorkspaces()
    }

    fun updatePendingSyncCount() {
        pendingSyncCount.value = localDb.getPendingCount()
    }

    fun refreshWorkspaces() {
        viewModelScope.launch {
            try {
                val list = client.fetchWorkspaces()
                if (list.isNotEmpty()) {
                    workspaces.value = list
                    if (currentWorkspace.value == null) {
                        selectWorkspace(list[0])
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun selectWorkspace(ws: Workspace) {
        currentWorkspace.value = ws
        currentFolder.value = ""
        loadFiles(ws.id, "")
        refreshGit(ws.id)
        refreshProcesses(ws.id)
    }

    fun loadFiles(workspaceId: String, path: String) {
        currentFolder.value = path
        viewModelScope.launch {
            try {
                val items = client.listFiles(workspaceId, path)
                fileItems.value = items
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun openFile(filePath: String) {
        val ws = currentWorkspace.value ?: return
        currentFilePath.value = filePath

        // Check local cache first
        val cached = localDb.getCachedFile(ws.id, filePath)
        if (cached != null) {
            editorContent.value = cached.content
            originalContent.value = cached.content
            currentFileVersion.value = cached.version
            isEditorDirty.value = false
        }

        // Fetch latest from laptop/server
        viewModelScope.launch {
            try {
                val file = client.readFile(ws.id, filePath)
                if (file != null) {
                    editorContent.value = file.content
                    originalContent.value = file.content
                    currentFileVersion.value = file.version
                    isEditorDirty.value = false
                    localDb.cacheFile(ws.id, filePath, file.content, file.version, file.hash)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun onEditorContentChange(newContent: String) {
        editorContent.value = newContent
        isEditorDirty.value = (newContent != originalContent.value)
    }

    fun saveFile() {
        val ws = currentWorkspace.value ?: return
        val path = currentFilePath.value ?: return
        val content = editorContent.value
        val baseVer = currentFileVersion.value

        viewModelScope.launch {
            if (client.connectionState.value == ConnectionState.OFFLINE) {
                // Queue operation locally
                val op = SyncOperation(
                    operation_id = "op_${System.currentTimeMillis()}_${(1000..9999).random()}",
                    workspace_id = ws.id,
                    device_id = client.deviceId,
                    file_path = path,
                    operation_type = "WRITE_FILE",
                    base_version = baseVer,
                    payload = content,
                    status = "PENDING"
                )
                localDb.insertPendingOperation(op)
                localDb.cacheFile(ws.id, path, content, baseVer + 1, "")
                originalContent.value = content
                currentFileVersion.value = baseVer + 1
                isEditorDirty.value = false
                updatePendingSyncCount()
            } else {
                // Online save
                try {
                    val resJson = client.writeFile(ws.id, path, content, baseVer)
                    val json = JSONObject(resJson)

                    if (json.optBoolean("success", true)) {
                        val payload = json.optJSONObject("payload")
                        val newVer = payload?.optLong("newVersion", baseVer + 1) ?: (baseVer + 1)
                        originalContent.value = content
                        currentFileVersion.value = newVer
                        isEditorDirty.value = false
                        localDb.cacheFile(ws.id, path, content, newVer, "")
                    } else {
                        val error = json.optJSONObject("error")
                        if (error?.optString("code") == "BASE_VERSION_MISMATCH") {
                            // Conflict detected!
                            val details = error.optJSONObject("details")
                            activeConflict.value = ConflictInfo(
                                conflict_id = "conf_${System.currentTimeMillis()}",
                                operation_id = "op_conflict",
                                workspace_id = ws.id,
                                file_path = path,
                                expected_version = details?.optLong("expectedVersion") ?: (baseVer + 1),
                                actual_version = details?.optLong("providedVersion") ?: baseVer,
                                laptop_content = details?.optString("laptopContent") ?: "",
                                phone_content = content,
                                detected_at = System.currentTimeMillis()
                            )
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    fun resolveActiveConflict(choice: String) {
        val conflict = activeConflict.value ?: return
        val ws = currentWorkspace.value ?: return

        viewModelScope.launch {
            when (choice) {
                "KEEP_LAPTOP" -> {
                    editorContent.value = conflict.laptop_content
                    originalContent.value = conflict.laptop_content
                    currentFileVersion.value = conflict.expected_version
                    isEditorDirty.value = false
                }
                "KEEP_PHONE" -> {
                    client.writeFile(ws.id, conflict.file_path, conflict.phone_content, conflict.expected_version)
                    originalContent.value = conflict.phone_content
                    currentFileVersion.value = conflict.expected_version + 1
                    isEditorDirty.value = false
                }
            }
            activeConflict.value = null
        }
    }

    fun flushOfflineOperations() {
        val ws = currentWorkspace.value ?: return
        viewModelScope.launch {
            val pending = localDb.getPendingOperations(ws.id)
            for (op in pending) {
                try {
                    val res = client.writeFile(ws.id, op.file_path, op.payload, op.base_version)
                    if (!res.contains("BASE_VERSION_MISMATCH")) {
                        localDb.removeOperation(op.operation_id)
                    }
                } catch (e: Exception) {
                    break
                }
            }
            updatePendingSyncCount()
        }
    }

    // Terminal
    fun openTerminal() {
        val ws = currentWorkspace.value ?: return
        if (terminalSession.value == null) {
            viewModelScope.launch {
                val session = client.createTerminal(ws.id)
                terminalSession.value = session
            }
        }
    }

    fun sendTerminalCommand(command: String) {
        val session = terminalSession.value ?: return
        client.sendTerminalInput(session.sessionId, "$command\r")
        val history = terminalHistory.value.toMutableList()
        history.add(command)
        terminalHistory.value = history
    }

    fun sendTerminalCtrlC() {
        val session = terminalSession.value ?: return
        client.sendTerminalInput(session.sessionId, "\u0003")
    }

    fun clearTerminal() {
        terminalBuffer.value = ""
    }

    // Git
    fun refreshGit(workspaceId: String) {
        viewModelScope.launch {
            try {
                gitStatus.value = client.fetchGitStatus(workspaceId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun viewGitDiff(path: String? = null) {
        val ws = currentWorkspace.value ?: return
        viewModelScope.launch {
            currentDiff.value = client.fetchGitDiff(ws.id, path)
        }
    }

    fun commitGit() {
        val ws = currentWorkspace.value ?: return
        val msg = gitCommitMessage.value
        if (msg.isBlank()) return
        viewModelScope.launch {
            val ok = client.commitGit(ws.id, msg)
            if (ok) {
                gitCommitMessage.value = ""
                refreshGit(ws.id)
            }
        }
    }

    // Processes
    fun refreshProcesses(workspaceId: String) {
        viewModelScope.launch {
            try {
                processes.value = client.fetchProcesses(workspaceId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun startProcess(command: String) {
        val ws = currentWorkspace.value ?: return
        viewModelScope.launch {
            client.startProcess(ws.id, command)
            refreshProcesses(ws.id)
        }
    }

    fun stopProcess(processId: String) {
        viewModelScope.launch {
            client.stopProcess(processId)
            currentWorkspace.value?.let { refreshProcesses(it.id) }
        }
    }

    // AI Assistant
    fun sendAIPrompt() {
        val ws = currentWorkspace.value ?: return
        val prompt = aiInputPrompt.value
        if (prompt.isBlank()) return

        val current = aiMessages.value.toMutableList()
        current.add("User" to prompt)
        aiMessages.value = current
        aiInputPrompt.value = ""

        viewModelScope.launch {
            client.startAISession(ws.id, aiAgentType.value, prompt)
        }
    }

    fun refreshSystemStats() {
        viewModelScope.launch {
            try {
                systemStats.value = client.fetchSystemStats()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
