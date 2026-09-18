package com.remotedev.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.data.model.ConnectionState
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(viewModel: AppViewModel) {
    val connState by viewModel.client.connectionState.collectAsState()
    val pendingCount by viewModel.pendingSyncCount.collectAsState()
    val workspaces by viewModel.workspaces.collectAsState()
    val devices by viewModel.devices.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("RemoteDev", fontWeight = FontWeight.Bold, color = TextPrimary)
                        Spacer(Modifier.width(8.dp))
                        Box(
                            Modifier
                                .size(8.dp)
                                .background(
                                    if (connState == ConnectionState.DIRECT || connState == ConnectionState.RELAY) AccentGreen else ErrorRed,
                                    RoundedCornerShape(4.dp)
                                )
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            connState.name,
                            fontSize = 12.sp,
                            color = if (connState == ConnectionState.OFFLINE) ErrorRed else AccentGreen
                        )
                    }
                },
                actions = {
                    if (pendingCount > 0) {
                        Surface(
                            color = WarningYellow.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.padding(end = 8.dp)
                        ) {
                            Text(
                                "Pending Sync: $pendingCount",
                                color = WarningYellow,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                    IconButton(onClick = { viewModel.refreshWorkspaces() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = TextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark)
            )
        },
        containerColor = BgDark
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Devices Section
            item {
                Text(
                    "Devices",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = TextSecondary,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            items(devices) { device ->
                Card(
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { viewModel.currentScreen.value = "device" }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Computer, contentDescription = null, tint = PrimaryBlue)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(device.name, fontWeight = FontWeight.Bold, color = TextPrimary)
                            Text(
                                if (connState != ConnectionState.OFFLINE) "Online • ${connState.name}" else "Offline",
                                fontSize = 12.sp,
                                color = if (connState != ConnectionState.OFFLINE) AccentGreen else TextMuted
                            )
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted)
                    }
                }
            }

            // Projects / Workspaces Section
            item {
                Text(
                    "Projects",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = TextSecondary,
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                )
            }
            if (workspaces.isEmpty()) {
                item {
                    Text(
                        "No approved workspaces found. Approve a workspace on your laptop agent.",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                }
            }
            items(workspaces) { ws ->
                Card(
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            viewModel.selectWorkspace(ws)
                            viewModel.currentScreen.value = "explorer"
                        }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Folder, contentDescription = null, tint = WarningYellow)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(ws.name, fontWeight = FontWeight.Bold, color = TextPrimary)
                            Text(ws.path, fontSize = 12.sp, color = TextMuted)
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted)
                    }
                }
            }
        }
    }
}
