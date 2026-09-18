package com.remotedev.client.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectExplorerScreen(viewModel: AppViewModel) {
    val ws by viewModel.currentWorkspace.collectAsState()
    val folder by viewModel.currentFolder.collectAsState()
    val items by viewModel.fileItems.collectAsState()
    var search by remember { mutableStateOf("") }
    var showCreateDialog by remember { mutableStateOf(false) }
    var newFileName by remember { mutableStateOf("") }

    val filteredItems = if (search.isBlank()) items else items.filter { it.name.contains(search, ignoreCase = true) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(ws?.name ?: "Explorer", fontWeight = FontWeight.Bold, color = TextPrimary)
                        Text(if (folder.isEmpty()) "/" else "/$folder", fontSize = 12.sp, color = TextMuted)
                    }
                },
                navigationIcon = {
                    if (folder.isNotEmpty()) {
                        IconButton(onClick = {
                            val parent = if (folder.contains("/")) folder.substringBeforeLast("/") else ""
                            ws?.let { viewModel.loadFiles(it.id, parent) }
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { showCreateDialog = true }) {
                        Icon(Icons.Default.Add, contentDescription = "New File", tint = PrimaryBlue)
                    }
                    IconButton(onClick = { ws?.let { viewModel.loadFiles(it.id, folder) } }) {
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
        ) {
            // Search Input
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Search files in project...", color = TextMuted, fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextMuted) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = SurfaceDark,
                    unfocusedContainerColor = SurfaceDark,
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = BorderDark,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary
                ),
                singleLine = true
            )

            // Items List
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(filteredItems) { item ->
                    val isDir = item.type == "directory"
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                if (isDir) {
                                    ws?.let { viewModel.loadFiles(it.id, item.path) }
                                } else {
                                    viewModel.openFile(item.path)
                                    viewModel.currentScreen.value = "editor"
                                }
                            }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (isDir) Icons.Default.Folder else Icons.Default.Description,
                            contentDescription = null,
                            tint = if (isDir) WarningYellow else PrimaryBlue,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.name, color = TextPrimary, fontSize = 14.sp)
                            if (!isDir && item.size != null) {
                                Text("${item.size} bytes", color = TextMuted, fontSize = 11.sp)
                            }
                        }
                    }
                    Divider(color = BorderDark.copy(alpha = 0.5f), thickness = 0.5.dp)
                }
            }
        }
    }

    if (showCreateDialog) {
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("Create New File", color = TextPrimary) },
            text = {
                OutlinedTextField(
                    value = newFileName,
                    onValueChange = { newFileName = it },
                    placeholder = { Text("e.g. index.ts", color = TextMuted) },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newFileName.isNotBlank()) {
                        val path = if (folder.isEmpty()) newFileName else "$folder/$newFileName"
                        viewModel.openFile(path)
                        viewModel.onEditorContentChange("")
                        viewModel.saveFile()
                        showCreateDialog = false
                        newFileName = ""
                        viewModel.currentScreen.value = "editor"
                    }
                }) {
                    Text("Create", color = PrimaryBlue)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = SurfaceDark
        )
    }
}
