"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemStats = getSystemStats;
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
function getSystemStats(agentVersion = '0.1.0') {
    const totalMemoryBytes = os_1.default.totalmem();
    const freeMemoryBytes = os_1.default.freemem();
    const uptimeSeconds = os_1.default.uptime();
    const osPlatform = `${os_1.default.type()} ${os_1.default.release()} (${os_1.default.arch()})`;
    // Calculate approximate CPU usage
    const cpus = os_1.default.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
        for (const type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    }
    const cpuUsagePercent = Math.round((1 - totalIdle / (totalTick || 1)) * 100);
    // Approximate disk usage on Windows or POSIX
    let diskTotalBytes = 500 * 1024 * 1024 * 1024; // fallback 500GB
    let diskFreeBytes = 250 * 1024 * 1024 * 1024;
    if (process.platform === 'win32') {
        try {
            const output = (0, child_process_1.execSync)('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const lines = output.trim().split('\n').map((l) => l.trim()).filter(Boolean);
            for (const line of lines.slice(1)) {
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                    const free = parseInt(parts[1], 10);
                    const total = parseInt(parts[2], 10);
                    if (!isNaN(free) && !isNaN(total)) {
                        diskFreeBytes = free;
                        diskTotalBytes = total;
                        break;
                    }
                }
            }
        }
        catch { }
    }
    return {
        cpuUsagePercent: Math.min(100, Math.max(0, cpuUsagePercent)),
        totalMemoryBytes,
        freeMemoryBytes,
        diskTotalBytes,
        diskFreeBytes,
        osPlatform,
        uptimeSeconds,
        agentVersion,
    };
}
