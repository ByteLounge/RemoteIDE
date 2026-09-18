package com.remotedev.client

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remotedev.client.ui.screens.*
import com.remotedev.client.ui.theme.*
import com.remotedev.client.ui.viewmodel.AppViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            RemoteDevTheme(darkTheme = true) {
                val currentScreen by viewModel.currentScreen.collectAsState()

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    containerColor = BgDark,
                    bottomBar = {
                        // Do not show bottom bar on Code Editor to maximize screen space for coding
                        if (currentScreen != "editor") {
                            NavigationBar(
                                containerColor = SurfaceDark,
                                tonalElevation = 0.dp
                            ) {
                                NavigationBarItem(
                                    selected = currentScreen == "home",
                                    onClick = { viewModel.currentScreen.value = "home" },
                                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                                    label = { Text("Home", fontSize = 11.sp) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PrimaryBlue,
                                        selectedTextColor = PrimaryBlue,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = SurfaceLight
                                    )
                                )
                                NavigationBarItem(
                                    selected = currentScreen == "explorer",
                                    onClick = { viewModel.currentScreen.value = "explorer" },
                                    icon = { Icon(Icons.Default.FolderOpen, contentDescription = "Projects") },
                                    label = { Text("Projects", fontSize = 11.sp) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PrimaryBlue,
                                        selectedTextColor = PrimaryBlue,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = SurfaceLight
                                    )
                                )
                                NavigationBarItem(
                                    selected = currentScreen == "terminal",
                                    onClick = { viewModel.currentScreen.value = "terminal" },
                                    icon = { Icon(Icons.Default.Terminal, contentDescription = "Terminal") },
                                    label = { Text("Terminal", fontSize = 11.sp) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PrimaryBlue,
                                        selectedTextColor = PrimaryBlue,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = SurfaceLight
                                    )
                                )
                                NavigationBarItem(
                                    selected = currentScreen == "git",
                                    onClick = { viewModel.currentScreen.value = "git" },
                                    icon = { Icon(Icons.Default.ForkRight, contentDescription = "Git") },
                                    label = { Text("Git", fontSize = 11.sp) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PrimaryBlue,
                                        selectedTextColor = PrimaryBlue,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = SurfaceLight
                                    )
                                )
                                NavigationBarItem(
                                    selected = currentScreen == "ai",
                                    onClick = { viewModel.currentScreen.value = "ai" },
                                    icon = { Icon(Icons.Default.SmartToy, contentDescription = "AI") },
                                    label = { Text("AI", fontSize = 11.sp) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PrimaryBlue,
                                        selectedTextColor = PrimaryBlue,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = SurfaceLight
                                    )
                                )
                                NavigationBarItem(
                                    selected = currentScreen == "processes",
                                    onClick = { viewModel.currentScreen.value = "processes" },
                                    icon = { Icon(Icons.Default.Memory, contentDescription = "Processes") },
                                    label = { Text("Processes", fontSize = 11.sp) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PrimaryBlue,
                                        selectedTextColor = PrimaryBlue,
                                        unselectedIconColor = TextMuted,
                                        unselectedTextColor = TextMuted,
                                        indicatorColor = SurfaceLight
                                    )
                                )
                            }
                        }
                    }
                ) { padding ->
                    Surface(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(padding),
                        color = BgDark
                    ) {
                        when (currentScreen) {
                            "home" -> HomeScreen(viewModel)
                            "explorer" -> ProjectExplorerScreen(viewModel)
                            "editor" -> CodeEditorScreen(viewModel)
                            "terminal" -> TerminalScreen(viewModel)
                            "processes" -> ProcessManagerScreen(viewModel)
                            "git" -> GitScreen(viewModel)
                            "ai" -> AIAgentScreen(viewModel)
                            "device" -> DeviceDetailScreen(viewModel)
                            else -> HomeScreen(viewModel)
                        }
                    }
                }
            }
        }
    }
}
