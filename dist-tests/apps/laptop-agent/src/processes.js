"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const child_process_1 = require("child_process");
const shared_utils_1 = require("@remotedev/shared-utils");
const protocol_1 = require("@remotedev/protocol");
const logger = (0, shared_utils_1.createLogger)('ProcessManager');
class ProcessManager {
    workspaceManager;
    processes = new Map();
    constructor(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }
    startProcess(workspaceId, command, args = []) {
        const ws = this.workspaceManager.getWorkspace(workspaceId);
        const processId = (0, shared_utils_1.generateId)('proc');
        const isWindows = process.platform === 'win32';
        // Use cmd.exe /c or powershell to properly parse shell syntax
        const shellExec = isWindows ? 'cmd.exe' : '/bin/sh';
        const shellArgs = isWindows ? ['/c', [command, ...args].join(' ')] : ['-c', [command, ...args].join(' ')];
        try {
            const child = (0, child_process_1.spawn)(shellExec, shellArgs, {
                cwd: ws.path,
                env: { ...process.env },
                windowsHide: true,
            });
            const info = {
                id: processId,
                workspaceId,
                command,
                args,
                pid: child.pid,
                status: 'RUNNING',
                startedAt: Date.now(),
            };
            const managed = {
                info,
                process: child,
                logs: [],
            };
            this.processes.set(processId, managed);
            const appendLog = (stream, text) => {
                // Detect port in stdout/stderr (e.g. "localhost:3000", "port 8080", "127.0.0.1:4000")
                const portMatch = text.match(/(?:localhost|127\.0\.0\.1|port)\s*[:= ]\s*(\d{2,5})/i);
                if (portMatch && !info.port) {
                    info.port = parseInt(portMatch[1], 10);
                }
                managed.logs.push({
                    processId,
                    stream,
                    text,
                    timestamp: Date.now(),
                });
                if (managed.logs.length > 1000)
                    managed.logs.shift();
            };
            child.stdout.on('data', (chunk) => appendLog('stdout', chunk.toString('utf8')));
            child.stderr.on('data', (chunk) => appendLog('stderr', chunk.toString('utf8')));
            child.on('close', (code) => {
                info.status = code === 0 ? 'STOPPED' : 'FAILED';
                info.exitCode = code ?? undefined;
                logger.info(`Process ${processId} (${command}) exited with code ${code}`);
            });
            child.on('error', (err) => {
                info.status = 'FAILED';
                logger.error(`Process ${processId} error`, err);
            });
            logger.info(`Started process ${processId} (${command}) PID ${child.pid}`);
            return info;
        }
        catch (err) {
            logger.error(`Failed to launch process: ${command}`, err);
            throw new protocol_1.RemoteDevError('COMMAND_FAILED', `Failed to launch command: ${err.message}`);
        }
    }
    stopProcess(processId) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new protocol_1.RemoteDevError('PROCESS_NOT_FOUND', `Process ${processId} not found`);
        }
        if (managed.process && managed.info.status === 'RUNNING') {
            try {
                managed.process.kill();
            }
            catch { }
            managed.info.status = 'STOPPED';
            logger.info(`Stopped process ${processId}`);
        }
        return managed.info;
    }
    restartProcess(processId) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new protocol_1.RemoteDevError('PROCESS_NOT_FOUND', `Process ${processId} not found`);
        }
        this.stopProcess(processId);
        return this.startProcess(managed.info.workspaceId, managed.info.command, managed.info.args);
    }
    listProcesses(workspaceId) {
        const all = Array.from(this.processes.values()).map((p) => p.info);
        return workspaceId ? all.filter((p) => p.workspaceId === workspaceId) : all;
    }
    getLogs(processId) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new protocol_1.RemoteDevError('PROCESS_NOT_FOUND', `Process ${processId} not found`);
        }
        return managed.logs;
    }
}
exports.ProcessManager = ProcessManager;
