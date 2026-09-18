package com.remotedev.client.data.network

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.remotedev.client.data.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

class RemoteDevClient(
    private var relayWsUrl: String = "ws://10.0.2.2:4000/ws",
    private var directWsUrl: String? = null
) {
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private var activeWebSocket: WebSocket? = null
    private val _connectionState = MutableStateFlow(ConnectionState.OFFLINE)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _terminalOutputs = MutableSharedFlow<Pair<String, String>>(extraBufferCapacity = 64)
    val terminalOutputs: SharedFlow<Pair<String, String>> = _terminalOutputs

    private val _aiChunks = MutableSharedFlow<AIAgentChunk>(extraBufferCapacity = 64)
    val aiChunks: SharedFlow<AIAgentChunk> = _aiChunks

    private val _fileWatchEvents = MutableSharedFlow<Pair<String, String>>(extraBufferCapacity = 64)
    val fileWatchEvents: SharedFlow<Pair<String, String>> = _fileWatchEvents

    private val pendingRequests = ConcurrentHashMap<String, (String) -> Unit>()
    private var reconnectJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    var deviceId: String = "dev_android_${System.currentTimeMillis()}"
    var targetLaptopId: String = "dev_laptop_001"
    var authToken: String? = null

    fun updateConfig(relayUrl: String, directUrl: String?, token: String?) {
        this.relayWsUrl = relayUrl
        this.directWsUrl = directUrl
        this.authToken = token
    }

    fun connect() {
        if (_connectionState.value == ConnectionState.DIRECT || _connectionState.value == ConnectionState.RELAY) {
            return
        }

        _connectionState.value = ConnectionState.RECONNECTING
        val targetUrl = directWsUrl ?: relayWsUrl
        val isDirect = directWsUrl != null

        val request = Request.Builder().url(targetUrl).build()
        activeWebSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connectionState.value = if (isDirect) ConnectionState.DIRECT else ConnectionState.RELAY
                // Send Handshake
                val handshake = mapOf(
                    "id" to "msg_${System.currentTimeMillis()}",
                    "type" to "auth.handshake",
                    "payload" to mapOf(
                        "deviceId" to deviceId,
                        "deviceType" to "ANDROID_PHONE",
                        "token" to authToken
                    )
                )
                webSocket.send(gson.toJson(handshake))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleIncomingMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                _connectionState.value = ConnectionState.OFFLINE
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.OFFLINE
                scheduleReconnect()
            }
        })
    }

    fun disconnect() {
        reconnectJob?.cancel()
        activeWebSocket?.close(1000, "User disconnected")
        activeWebSocket = null
        _connectionState.value = ConnectionState.OFFLINE
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(3000)
            if (_connectionState.value == ConnectionState.OFFLINE) {
                connect()
            }
        }
    }

    private fun handleIncomingMessage(text: String) {
        try {
            val mapType = object : TypeToken<Map<String, Any>>() {}.type
            val raw: Map<String, Any> = gson.fromJson(text, mapType)
            val type = raw["type"] as? String ?: return
            val requestId = raw["requestId"] as? String

            if (requestId != null && pendingRequests.containsKey(requestId)) {
                pendingRequests.remove(requestId)?.invoke(text)
                return
            }

            when (type) {
                "terminal.output" -> {
                    val payload = raw["payload"] as? Map<*, *>
                    val sessionId = payload?.get("sessionId") as? String ?: ""
                    val data = payload?.get("data") as? String ?: ""
                    scope.launch { _terminalOutputs.emit(sessionId to data) }
                }
                "ai.session.chunk" -> {
                    val payloadJson = gson.toJson(raw["payload"])
                    val chunk = gson.fromJson(payloadJson, AIAgentChunk::class.java)
                    if (chunk != null) {
                        scope.launch { _aiChunks.emit(chunk) }
                    }
                }
                "file.watch.event" -> {
                    val payload = raw["payload"] as? Map<*, *>
                    val path = payload?.get("path") as? String ?: ""
                    val event = payload?.get("event") as? String ?: ""
                    scope.launch { _fileWatchEvents.emit(path to event) }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun sendRequest(type: String, payload: Any? = null): String = suspendCancellableCoroutine { continuation ->
        val msgId = "req_${System.currentTimeMillis()}_${(1000..9999).random()}"
        val envelope = mapOf(
            "id" to msgId,
            "type" to type,
            "source" to deviceId,
            "target" to targetLaptopId,
            "timestamp" to System.currentTimeMillis(),
            "payload" to payload
        )

        val json = gson.toJson(envelope)
        pendingRequests[msgId] = { responseJson ->
            if (continuation.isActive) {
                continuation.resume(responseJson)
            }
        }

        continuation.invokeOnCancellation {
            pendingRequests.remove(msgId)
        }

        val sent = activeWebSocket?.send(json) ?: false
        if (!sent) {
            pendingRequests.remove(msgId)
            if (continuation.isActive) {
                continuation.resume("""{"success":false,"error":{"code":"OFFLINE","message":"Device is offline"}}""")
            }
        }
    }

    // --- High-level API Calls ---

    suspend fun pairWithLaptop(code: String, deviceName: String): Boolean {
        val res = sendRequest("device.pair", mapOf("code" to code, "deviceName" to deviceName))
        return res.contains("\"paired\":true")
    }

    suspend fun fetchWorkspaces(): List<Workspace> {
        val res = sendRequest("workspace.list")
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        val listJson = gson.toJson(payload?.get("workspaces"))
        val listType = object : TypeToken<List<Workspace>>() {}.type
        return gson.fromJson(listJson, listType) ?: emptyList()
    }

    suspend fun listFiles(workspaceId: String, path: String = ""): List<FileItem> {
        val res = sendRequest("file.list", mapOf("workspaceId" to workspaceId, "path" to path))
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        val itemsJson = gson.toJson(payload?.get("items"))
        val listType = object : TypeToken<List<FileItem>>() {}.type
        return gson.fromJson(itemsJson, listType) ?: emptyList()
    }

    suspend fun readFile(workspaceId: String, path: String): FileContent? {
        val res = sendRequest("file.read", mapOf("workspaceId" to workspaceId, "path" to path))
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        val fileJson = gson.toJson(payload?.get("file"))
        return gson.fromJson(fileJson, FileContent::class.java)
    }

    suspend fun writeFile(workspaceId: String, path: String, content: String, baseVersion: Long): String {
        return sendRequest("file.write", mapOf(
            "workspaceId" to workspaceId,
            "path" to path,
            "content" to content,
            "baseVersion" to baseVersion
        ))
    }

    suspend fun createTerminal(workspaceId: String, shell: String = "powershell.exe"): TerminalSession? {
        val res = sendRequest("terminal.create", mapOf("workspaceId" to workspaceId, "shell" to shell))
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        return gson.fromJson(gson.toJson(payload), TerminalSession::class.java)
    }

    fun sendTerminalInput(sessionId: String, data: String) {
        val envelope = mapOf(
            "id" to "input_${System.currentTimeMillis()}",
            "type" to "terminal.input",
            "source" to deviceId,
            "target" to targetLaptopId,
            "payload" to mapOf("sessionId" to sessionId, "data" to data)
        )
        activeWebSocket?.send(gson.toJson(envelope))
    }

    suspend fun fetchProcesses(workspaceId: String): List<ProcessInfo> {
        val res = sendRequest("process.list", mapOf("workspaceId" to workspaceId))
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        val listJson = gson.toJson(payload?.get("processes"))
        val type = object : TypeToken<List<ProcessInfo>>() {}.type
        return gson.fromJson(listJson, type) ?: emptyList()
    }

    suspend fun startProcess(workspaceId: String, command: String): Boolean {
        val res = sendRequest("process.start", mapOf("workspaceId" to workspaceId, "command" to command))
        return res.contains("\"status\":\"RUNNING\"")
    }

    suspend fun stopProcess(processId: String): Boolean {
        val res = sendRequest("process.stop", mapOf("processId" to processId))
        return res.contains("\"status\":\"STOPPED\"")
    }

    suspend fun fetchGitStatus(workspaceId: String): GitStatusResult {
        val res = sendRequest("git.status", mapOf("workspaceId" to workspaceId))
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        val statusJson = gson.toJson(payload?.get("status"))
        return gson.fromJson(statusJson, GitStatusResult::class.java) ?: GitStatusResult()
    }

    suspend fun fetchGitDiff(workspaceId: String, path: String? = null): String {
        val res = sendRequest("git.diff", mapOf("workspaceId" to workspaceId, "path" to path))
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        return payload?.get("diff") as? String ?: ""
    }

    suspend fun stageGitFiles(workspaceId: String, paths: List<String>): Boolean {
        val res = sendRequest("git.stage", mapOf("workspaceId" to workspaceId, "paths" to paths))
        return res.contains("\"staged\":true")
    }

    suspend fun commitGit(workspaceId: String, message: String): Boolean {
        val res = sendRequest("git.commit", mapOf("workspaceId" to workspaceId, "message" to message))
        return res.contains("\"commitHash\"")
    }

    suspend fun pushGit(workspaceId: String): String {
        return sendRequest("git.push", mapOf("workspaceId" to workspaceId))
    }

    suspend fun pullGit(workspaceId: String): String {
        return sendRequest("git.pull", mapOf("workspaceId" to workspaceId))
    }

    suspend fun startAISession(workspaceId: String, agentType: String, prompt: String) {
        sendRequest("ai.session.start", mapOf(
            "workspaceId" to workspaceId,
            "agentType" to agentType,
            "prompt" to prompt
        ))
    }

    suspend fun fetchSystemStats(): SystemStats {
        val res = sendRequest("system.stats")
        val root: Map<String, Any> = gson.fromJson(res, object : TypeToken<Map<String, Any>>() {}.type)
        val payload = root["payload"] as? Map<*, *>
        val statsJson = gson.toJson(payload?.get("stats"))
        return gson.fromJson(statsJson, SystemStats::class.java) ?: SystemStats()
    }
}
