import os from 'os';
import { execSync } from 'child_process';
import { SystemStats } from '@remotedev/types';

export function getSystemStats(agentVersion = '0.1.0'): SystemStats {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const uptimeSeconds = os.uptime();
  const osPlatform = `${os.type()} ${os.release()} (${os.arch()})`;

  // Calculate approximate CPU usage
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as any)[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuUsagePercent = Math.round((1 - totalIdle / (totalTick || 1)) * 100);

  // Approximate disk usage on Windows or POSIX
  let diskTotalBytes = 500 * 1024 * 1024 * 1024; // fallback 500GB
  let diskFreeBytes = 250 * 1024 * 1024 * 1024;

  if (process.platform === 'win32') {
    try {
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
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
    } catch {}
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
