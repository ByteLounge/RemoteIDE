package com.remotedev.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CodeEditorScreen(viewModel: AppViewModel) {
    val filePath by viewModel.currentFilePath.collectAsState()
    val content by viewModel.editorContent.collectAsState()
    val isDirty by viewModel.isEditorDirty.collectAsState()
    val version by viewModel.currentFileVersion.collectAsState()
    val activeConflict by viewModel.activeConflict.collectAsState()

    var showSearch by remember { mutableStateOf(false) }
    var searchStr by remember { mutableStateOf("") }
    var replaceStr by remember { mutableStateOf("") }

    val hScrollState = rememberScrollState()
    val vScrollState = rememberScrollState()

    val lines = remember(content) { content.split("\n") }
    val lineCount = lines.size

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            filePath?.substringAfterLast("/") ?: "Editor",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = TextPrimary
                        )
                        if (isDirty) {
                            Spacer(Modifier.width(6.dp))
                            Text("●", color = PrimaryBlue, fontSize = 14.sp)
                        }
                        Spacer(Modifier.width(8.dp))
                        Text("v$version", fontSize = 11.sp, color = TextMuted)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { viewModel.currentScreen.value = "explorer" }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                },
                actions = {
                    IconButton(onClick = { showSearch = !showSearch }) {
                        Icon(Icons.Default.Search, contentDescription = "Find/Replace", tint = if (showSearch) PrimaryBlue else TextSecondary)
                    }
                    IconButton(
                        onClick = { viewModel.saveFile() },
                        enabled = isDirty
                    ) {
                        Icon(Icons.Default.Save, contentDescription = "Save", tint = if (isDirty) AccentGreen else TextMuted)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark)
            )
        },
        containerColor = TerminalBg
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Find / Replace Bar
            if (showSearch) {
                Surface(
                    color = SurfaceDark,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = searchStr,
                            onValueChange = { searchStr = it },
                            placeholder = { Text("Find...", fontSize = 12.sp, color = TextMuted) },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        Spacer(Modifier.width(8.dp))
                        OutlinedTextField(
                            value = replaceStr,
                            onValueChange = { replaceStr = it },
                            placeholder = { Text("Replace...", fontSize = 12.sp, color = TextMuted) },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = {
                            if (searchStr.isNotEmpty()) {
                                val replaced = content.replace(searchStr, replaceStr)
                                viewModel.onEditorContentChange(replaced)
                            }
                        }) {
                            Text("All", color = PrimaryBlue, fontSize = 12.sp)
                        }
                    }
                }
            }

            // Editor Canvas: Line numbers + Code Area
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(vScrollState)
            ) {
                // Line Numbers Gutter
                Column(
                    modifier = Modifier
                        .background(SurfaceDark)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.End
                ) {
                    for (i in 1..lineCount) {
                        Text(
                            text = "$i",
                            color = TextMuted,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 18.sp
                        )
                    }
                }

                // Code Input Canvas
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(hScrollState)
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    BasicTextField(
                        value = content,
                        onValueChange = { viewModel.onEditorContentChange(it) },
                        textStyle = TextStyle(
                            color = TextPrimary,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 18.sp
                        ),
                        cursorBrush = SolidColor(PrimaryBlue),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }

    // Conflict Resolution Dialog
    activeConflict?.let { conflict ->
        AlertDialog(
            onDismissRequest = { /* force decision */ },
            title = {
                Text(
                    "File Changed On Laptop",
                    color = WarningYellow,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column {
                    Text(
                        "The file '${conflict.file_path}' was modified on another device (base v${conflict.actual_version} != current v${conflict.expected_version}).",
                        color = TextPrimary,
                        fontSize = 13.sp
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Laptop Version Preview:", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = TextSecondary)
                    Surface(color = BgDark, shape = MaterialTheme.shapes.small) {
                        Text(
                            conflict.laptop_content.take(200),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = TextMuted,
                            modifier = Modifier.padding(6.dp)
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.resolveActiveConflict("KEEP_PHONE") }) {
                    Text("Keep Phone", color = PrimaryBlue)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.resolveActiveConflict("KEEP_LAPTOP") }) {
                    Text("Keep Laptop", color = ErrorRed)
                }
            },
            containerColor = SurfaceDark
        )
    }
}
