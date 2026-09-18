package com.remotedev.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.data.model.ProcessInfo
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProcessManagerScreen(viewModel: AppViewModel) {
    val processes by viewModel.processes.collectAsState()
    val ws by viewModel.currentWorkspace.collectAsState()
    var showStartDialog by remember { mutableStateOf(false) }
    var newCommand by remember { mutableStateOf("") }
    var selectedProcessForLogs by remember { mutableStateOf<ProcessInfo?>(null) }

    LaunchedEffect(ws) {
        ws?.let { viewModel.refreshProcesses(it.id) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Processes", fontWeight = FontWeight.Bold, color = TextPrimary) },
                actions = {
                    IconButton(onClick = { showStartDialog = true }) {
                        Icon(Icons.Default.PlayArrow, contentDescription = "Start Process", tint = PrimaryBlue)
                    }
                    IconButton(onClick = { ws?.let { viewModel.refreshProcesses(it.id) } }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = TextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark)
            )
        },
        containerColor = BgDark
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            if (processes.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No processes currently running.\nTap '+' to launch a command.", color = TextMuted, fontSize = 13.sp)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(processes) { proc ->
                        Card(
                            shape = RoundedCornerShape(8.dp),
                            colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        Modifier
                                            .size(8.dp)
                                            .background(
                                                if (proc.status == "RUNNING") AccentGreen else ErrorRed,
                                                RoundedCornerShape(4.dp)
                                            )
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(proc.command, fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 15.sp)
                                    Spacer(Modifier.weight(1f))
                                    Text(
                                        proc.status,
                                        color = if (proc.status == "RUNNING") AccentGreen else TextMuted,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    proc.pid?.let { Text("PID $it", fontSize = 12.sp, color = TextMuted) }
                                    proc.port?.let { Text("Port $it", fontSize = 12.sp, color = PrimaryBlue, fontWeight = FontWeight.Bold) }
                                }
                                Spacer(Modifier.height(12.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = { selectedProcessForLogs = proc },
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                    ) {
                                        Text("View Logs", fontSize = 12.sp, color = PrimaryBlue)
                                    }
                                    if (proc.status == "RUNNING") {
                                        Button(
                                            onClick = { viewModel.stopProcess(proc.id) },
                                            colors = ButtonDefaults.buttonColors(containerColor = ErrorRed),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                        ) {
                                            Text("Stop", fontSize = 12.sp, color = TextPrimary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showStartDialog) {
        AlertDialog(
            onDismissRequest = { showStartDialog = false },
            title = { Text("Launch Development Process", color = TextPrimary) },
            text = {
                OutlinedTextField(
                    value = newCommand,
                    onValueChange = { newCommand = it },
                    placeholder = { Text("e.g. npm run dev", color = TextMuted) },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newCommand.isNotBlank()) {
                        viewModel.startProcess(newCommand)
                        newCommand = ""
                        showStartDialog = false
                    }
                }) {
                    Text("Start", color = PrimaryBlue)
                }
            },
            dismissButton = {
                TextButton(onClick = { showStartDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = SurfaceDark
        )
    }

    selectedProcessForLogs?.let { proc ->
        AlertDialog(
            onDismissRequest = { selectedProcessForLogs = null },
            title = { Text("Logs: ${proc.command}", color = TextPrimary) },
            text = {
                Surface(
                    color = TerminalBg,
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.fillMaxWidth().height(250.dp).padding(4.dp)
                ) {
                    Text(
                        "[Process PID ${proc.pid} initialized]\nStreaming logs from laptop...\nReady on port ${proc.port ?: 3000}",
                        color = TextPrimary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { selectedProcessForLogs = null }) {
                    Text("Close", color = PrimaryBlue)
                }
            },
            containerColor = SurfaceDark
        )
    }
}
