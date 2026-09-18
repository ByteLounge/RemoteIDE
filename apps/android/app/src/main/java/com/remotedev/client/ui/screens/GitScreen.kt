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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GitScreen(viewModel: AppViewModel) {
    val ws by viewModel.currentWorkspace.collectAsState()
    val status by viewModel.gitStatus.collectAsState()
    val diff by viewModel.currentDiff.collectAsState()
    val commitMsg by viewModel.gitCommitMessage.collectAsState()
    var showDiffDialog by remember { mutableStateOf(false) }

    LaunchedEffect(ws) {
        ws?.let { viewModel.refreshGit(it.id) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.ForkRight, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(status.branch, fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                    }
                },
                actions = {
                    IconButton(onClick = { ws?.let { viewModel.refreshGit(it.id) } }) {
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
            // Commit Box
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    OutlinedTextField(
                        value = commitMsg,
                        onValueChange = { viewModel.gitCommitMessage.value = it },
                        placeholder = { Text("Commit message...", color = TextMuted, fontSize = 13.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = BgDark,
                            unfocusedContainerColor = BgDark,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { viewModel.commitGit() },
                            colors = ButtonDefaults.buttonColors(containerColor = AccentGreen),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Commit", color = TextPrimary, fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = { ws?.let { viewModel.viewModelScope.launch { viewModel.client.pullGit(it.id); viewModel.refreshGit(it.id) } } }
                        ) {
                            Text("Pull", color = PrimaryBlue)
                        }
                        OutlinedButton(
                            onClick = { ws?.let { viewModel.viewModelScope.launch { viewModel.client.pushGit(it.id); viewModel.refreshGit(it.id) } } }
                        ) {
                            Text("Push", color = PrimaryBlue)
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Changes List
            Text("Changes (${status.files.size})", fontWeight = FontWeight.Bold, color = TextSecondary, fontSize = 14.sp)
            Spacer(Modifier.height(8.dp))

            if (status.files.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Working tree clean. No changes.", color = TextMuted, fontSize = 13.sp)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(status.files) { file ->
                        Card(
                            shape = RoundedCornerShape(6.dp),
                            colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.viewGitDiff(file.path)
                                    showDiffDialog = true
                                }
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val statusText = when {
                                    file.isUntracked -> "??"
                                    file.stagedStatus != null -> file.stagedStatus
                                    else -> file.unstagedStatus ?: "M"
                                }
                                val statusColor = when (statusText) {
                                    "A", "??" -> AccentGreen
                                    "D" -> ErrorRed
                                    else -> WarningYellow
                                }
                                Text(statusText, color = statusColor, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Spacer(Modifier.width(12.dp))
                                Text(file.path, color = TextPrimary, fontSize = 13.sp, modifier = Modifier.weight(1f))
                                Text("View Diff", color = PrimaryBlue, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDiffDialog) {
        AlertDialog(
            onDismissRequest = { showDiffDialog = false },
            title = { Text("Git Diff", color = TextPrimary) },
            text = {
                Surface(
                    color = TerminalBg,
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.fillMaxWidth().height(300.dp)
                ) {
                    Text(
                        if (diff.isBlank()) "No unstaged diff available." else diff,
                        color = TextPrimary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showDiffDialog = false }) {
                    Text("Close", color = PrimaryBlue)
                }
            },
            containerColor = SurfaceDark
        )
    }
}
