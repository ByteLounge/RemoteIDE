import path from 'path';
import { RemoteDevError } from '@remotedev/protocol';

export const DEFAULT_EXCLUDED_PATTERNS = [
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
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Validates that a requested target relative or absolute path is strictly
 * inside the approved workspace root directory, preventing directory traversal.
 */
export function resolveSafeWorkspacePath(workspaceRoot: string, targetPath: string): string {
  if (targetPath.includes('\0')) {
    throw new RemoteDevError('PATH_TRAVERSAL_DENIED', 'Null byte detected in path');
  }

  // Resolve absolute paths
  const canonicalRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(canonicalRoot, targetPath);

  // Cross-platform check: on Windows case-insensitive comparison
  const isWindows = process.platform === 'win32';
  const rootCompare = isWindows ? canonicalRoot.toLowerCase() : canonicalRoot;
  const targetCompare = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;

  const relative = path.relative(rootCompare, targetCompare);

  // If relative starts with '..' or is outside, reject
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new RemoteDevError(
      'PATH_TRAVERSAL_DENIED',
      `Access denied: path "${targetPath}" escapes approved workspace "${workspaceRoot}"`
    );
  }

  return resolvedTarget;
}

/**
 * Converts an absolute path within a workspace to a clean, normalized relative path
 */
export function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  const safePath = resolveSafeWorkspacePath(workspaceRoot, absolutePath);
  const rel = path.relative(path.resolve(workspaceRoot), safePath);
  return normalizePath(rel);
}

/**
 * Checks if a relative path matches excluded directories or sensitive files
 */
export function isPathExcluded(relativePath: string, customExclusions: string[] = []): boolean {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split('/');
  const patterns = [...DEFAULT_EXCLUDED_PATTERNS, ...customExclusions];

  return segments.some((segment) => patterns.includes(segment));
}
