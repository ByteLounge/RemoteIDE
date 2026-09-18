package com.remotedev.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
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
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalScreen(viewModel: AppViewModel) {
    val session by viewModel.terminalSession.collectAsState()
    val buffer by viewModel.terminalBuffer.collectAsState()
    var inputCmd by remember { mutableStateOf("") }
    val vScroll = rememberScrollState()

    LaunchedEffect(Unit) {
        viewModel.openTerminal()
    }

    LaunchedEffect(buffer) {
        vScroll.animateScrollTo(vScroll.maxValue)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Terminal", fontWeight = FontWeight.Bold, color = TextPrimary)
                        Text(
                            session?.let { "${it.shell} • Active" } ?: "Connecting...",
                            fontSize = 12.sp,
                            color = if (session != null) AccentGreen else TextMuted
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.clearTerminal() }) {
                        Icon(Icons.Default.DeleteSweep, contentDescription = "Clear", tint = TextSecondary)
                    }
                    IconButton(onClick = { viewModel.openTerminal() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Reconnect", tint = TextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark)
            )
        },
        bottomBar = {
            Column(modifier = Modifier.background(SurfaceDark)) {
                // Accessory Keyboard Row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    AssistChip(
                        onClick = { viewModel.sendTerminalCtrlC() },
                        label = { Text("Ctrl+C", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ErrorRed) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = SurfaceLight)
                    )
                    AssistChip(
                        onClick = { viewModel.client.sendTerminalInput(session?.sessionId ?: "", "\t") },
                        label = { Text("Tab", fontSize = 11.sp, color = TextPrimary) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = SurfaceLight)
                    )
                    AssistChip(
                        onClick = { viewModel.client.sendTerminalInput(session?.sessionId ?: "", "\u001b") },
                        label = { Text("Esc", fontSize = 11.sp, color = TextPrimary) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = SurfaceLight)
                    )
                    AssistChip(
                        onClick = { viewModel.sendTerminalCommand("git status") },
                        label = { Text("git status", fontSize = 11.sp, color = PrimaryBlue) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = SurfaceLight)
                    )
                }

                // Command Input Field
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = inputCmd,
                        onValueChange = { inputCmd = it },
                        placeholder = { Text("Enter terminal command...", color = TextMuted, fontSize = 13.sp) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = BgDark,
                            unfocusedContainerColor = BgDark,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                    Spacer(Modifier.width(8.dp))
                    IconButton(
                        onClick = {
                            if (inputCmd.isNotBlank()) {
                                viewModel.sendTerminalCommand(inputCmd)
                                inputCmd = ""
                            }
                        },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = PrimaryBlue)
                    ) {
                        Icon(Icons.Default.Send, contentDescription = "Run", tint = BgDark)
                    }
                }
            }
        },
        containerColor = TerminalBg
    ) { padding ->
        SelectionContainer(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(vScroll)
                .padding(12.dp)
        ) {
            Text(
                text = if (buffer.isEmpty()) "Waiting for PowerShell output...\n" else buffer,
                color = TextPrimary,
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                lineHeight = 16.sp
            )
        }
    }
}
