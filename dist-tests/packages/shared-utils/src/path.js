"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EXCLUDED_PATTERNS = void 0;
exports.normalizePath = normalizePath;
exports.resolveSafeWorkspacePath = resolveSafeWorkspacePath;
exports.toWorkspaceRelativePath = toWorkspaceRelativePath;
exports.isPathExcluded = isPathExcluded;
const path_1 = __importDefault(require("path"));
const protocol_1 = require("@remotedev/protocol");
exports.DEFAULT_EXCLUDED_PATTERNS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.gradle',
    '.cache',
    '.vscode',
    '.idea',
    '__pycache__',
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
];
/**
 * Normalizes Windows & POSIX paths to uniform forward-slash representation
 */
function normalizePath(p) {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
/**
 * Validates that a requested target relative or absolute path is strictly
 * inside the approved workspace root directory, preventing directory traversal.
 */
function resolveSafeWorkspacePath(workspaceRoot, targetPath) {
    if (targetPath.includes('\0')) {
        throw new protocol_1.RemoteDevError('PATH_TRAVERSAL_DENIED', 'Null byte detected in path');
    }
    // Resolve absolute paths
    const canonicalRoot = path_1.default.resolve(workspaceRoot);
    const resolvedTarget = path_1.default.isAbsolute(targetPath)
        ? path_1.default.resolve(targetPath)
        : path_1.default.resolve(canonicalRoot, targetPath);
    // Cross-platform check: on Windows case-insensitive comparison
    const isWindows = process.platform === 'win32';
    const rootCompare = isWindows ? canonicalRoot.toLowerCase() : canonicalRoot;
    const targetCompare = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const relative = path_1.default.relative(rootCompare, targetCompare);
    // If relative starts with '..' or is outside, reject
    if (relative.startsWith('..') || path_1.default.isAbsolute(relative)) {
        throw new protocol_1.RemoteDevError('PATH_TRAVERSAL_DENIED', `Access denied: path "${targetPath}" escapes approved workspace "${workspaceRoot}"`);
    }
    return resolvedTarget;
}
/**
 * Converts an absolute path within a workspace to a clean, normalized relative path
 */
function toWorkspaceRelativePath(workspaceRoot, absolutePath) {
    const safePath = resolveSafeWorkspacePath(workspaceRoot, absolutePath);
    const rel = path_1.default.relative(path_1.default.resolve(workspaceRoot), safePath);
    return normalizePath(rel);
}
/**
 * Checks if a relative path matches excluded directories or sensitive files
 */
function isPathExcluded(relativePath, customExclusions = []) {
    const normalized = normalizePath(relativePath);
    const segments = normalized.split('/');
    const patterns = [...exports.DEFAULT_EXCLUDED_PATTERNS, ...customExclusions];
    return segments.some((segment) => patterns.includes(segment));
}
