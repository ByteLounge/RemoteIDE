package com.remotedev.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.data.model.ConnectionState
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceDetailScreen(viewModel: AppViewModel) {
    val connState by viewModel.client.connectionState.collectAsState()
    val stats by viewModel.systemStats.collectAsState()
    var showPairDialog by remember { mutableStateOf(false) }
    var pairCodeInput by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        viewModel.refreshSystemStats()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Windows Laptop", fontWeight = FontWeight.Bold, color = TextPrimary) },
                navigationIcon = {
                    IconButton(onClick = { viewModel.currentScreen.value = "home" }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Status Card
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(10.dp)
                                .background(
                                    if (connState != ConnectionState.OFFLINE) AccentGreen else ErrorRed,
                                    RoundedCornerShape(5.dp)
                                )
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (connState != ConnectionState.OFFLINE) "Online" else "Offline",
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            fontSize = 16.sp
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Connection Mode: ${connState.name}", color = TextSecondary, fontSize = 13.sp)
                    Text("Platform: ${stats.osPlatform.ifEmpty { "Windows 11 (x64)" }}", color = TextMuted, fontSize = 12.sp)
                    Text("Agent Version: v${stats.agentVersion.ifEmpty { "0.1.0" }}", color = TextMuted, fontSize = 12.sp)
                }
            }

            // Resource Metrics Card
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("System Diagnostics", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 14.sp)

                    Column {
                        Row {
                            Text("CPU Usage", color = TextSecondary, fontSize = 12.sp)
                            Spacer(Modifier.weight(1f))
                            Text("${stats.cpuUsagePercent}%", color = PrimaryBlue, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(4.dp))
                        LinearProgressIndicator(
                            progress = { stats.cpuUsagePercent / 100f },
                            modifier = Modifier.fillMaxWidth(),
                            color = PrimaryBlue,
                            trackColor = SurfaceLight
                        )
                    }

                    Column {
                        val ramUsedGb = ((stats.totalMemoryBytes - stats.freeMemoryBytes) / (1024.0 * 1024.0 * 1024.0))
                        val ramTotalGb = (stats.totalMemoryBytes / (1024.0 * 1024.0 * 1024.0))
                        val ramPercent = if (ramTotalGb > 0) (ramUsedGb / ramTotalGb).toFloat() else 0.4f
                        Row {
                            Text("RAM Memory", color = TextSecondary, fontSize = 12.sp)
                            Spacer(Modifier.weight(1f))
                            Text(String.format("%.1f / %.1f GB", ramUsedGb, ramTotalGb), color = PrimaryBlue, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(4.dp))
                        LinearProgressIndicator(
                            progress = { ramPercent },
                            modifier = Modifier.fillMaxWidth(),
                            color = AccentGreen,
                            trackColor = SurfaceLight
                        )
                    }
                }
            }

            // Actions Card
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Controls", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 14.sp)

                    Button(
                        onClick = { showPairDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Pair With Code", color = BgDark, fontWeight = FontWeight.Bold)
                    }

                    OutlinedButton(
                        onClick = {
                            if (connState == ConnectionState.OFFLINE) viewModel.client.connect()
                            else viewModel.client.disconnect()
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            if (connState == ConnectionState.OFFLINE) "Connect" else "Disconnect",
                            color = if (connState == ConnectionState.OFFLINE) AccentGreen else ErrorRed
                        )
                    }

                    OutlinedButton(
                        onClick = { viewModel.flushOfflineOperations() },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Flush Pending Sync", color = PrimaryBlue)
                    }
                }
            }
        }
    }

    if (showPairDialog) {
        AlertDialog(
            onDismissRequest = { showPairDialog = false },
            title = { Text("Pair with Laptop", color = TextPrimary) },
            text = {
                Column {
                    Text(
                        "Enter the 6-digit PIN displayed on your Windows Laptop terminal (e.g. 742 193):",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = pairCodeInput,
                        onValueChange = { pairCodeInput = it },
                        placeholder = { Text("742 193", color = TextMuted) },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val ok = viewModel.client.pairWithLaptop(pairCodeInput, "My Android Device")
                        if (ok) {
                            showPairDialog = false
                            pairCodeInput = ""
                            viewModel.refreshWorkspaces()
                        }
                    }
                }) {
                    Text("Pair", color = PrimaryBlue)
                }
            },
            dismissButton = {
                TextButton(onClick = { showPairDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = SurfaceDark
        )
    }
}
