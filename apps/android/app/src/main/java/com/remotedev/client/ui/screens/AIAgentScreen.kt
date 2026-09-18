package com.remotedev.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
fun AIAgentScreen(viewModel: AppViewModel) {
    val messages by viewModel.aiMessages.collectAsState()
    val agentType by viewModel.aiAgentType.collectAsState()
    val promptInput by viewModel.aiInputPrompt.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("AI Assistant", fontWeight = FontWeight.Bold, color = TextPrimary)
                        Text("$agentType • Running on Laptop", fontSize = 12.sp, color = AccentGreen)
                    }
                },
                actions = {
                    var expanded by remember { mutableStateOf(false) }
                    IconButton(onClick = { expanded = true }) {
                        Icon(Icons.Default.Tune, contentDescription = "Select Agent", tint = PrimaryBlue)
                    }
                    DropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false },
                        modifier = Modifier.background(SurfaceDark)
                    ) {
                        listOf("ClaudeCode", "GeminiCLI", "GenericCLI").forEach { type ->
                            DropdownMenuItem(
                                text = { Text(type, color = TextPrimary) },
                                onClick = {
                                    viewModel.aiAgentType.value = type
                                    expanded = false
                                }
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark)
            )
        },
        bottomBar = {
            Surface(color = SurfaceDark) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = promptInput,
                        onValueChange = { viewModel.aiInputPrompt.value = it },
                        placeholder = { Text("Ask AI to fix bug, write tests...", color = TextMuted, fontSize = 13.sp) },
                        modifier = Modifier.weight(1f),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = BgDark,
                            unfocusedContainerColor = BgDark,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        maxLines = 3
                    )
                    Spacer(Modifier.width(8.dp))
                    IconButton(
                        onClick = { viewModel.sendAIPrompt() },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = PrimaryBlue)
                    ) {
                        Icon(Icons.Default.Send, contentDescription = "Send", tint = BgDark)
                    }
                }
            }
        },
        containerColor = BgDark
    ) { padding ->
        if (messages.isEmpty()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.SmartToy, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(12.dp))
                    Text("Remote AI Coding Assistant", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Executes directly on your Windows laptop.\nNo source code sent to external cloud.",
                        color = TextMuted,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(messages) { (sender, text) ->
                    val isUser = sender == "User"
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
                    ) {
                        Text(
                            sender,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isUser) PrimaryBlue else AccentGreen,
                            modifier = Modifier.padding(bottom = 2.dp)
                        )
                        Surface(
                            color = if (isUser) SurfaceLight else TerminalBg,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text,
                                color = TextPrimary,
                                fontSize = 12.sp,
                                fontFamily = if (isUser) FontFamily.Default else FontFamily.Monospace,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
