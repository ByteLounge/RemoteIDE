import path from 'path';
import {
  resolveSafeWorkspacePath,
  isPathExcluded,
  sanitizeLogData,
  toWorkspaceRelativePath,
} from '../packages/shared-utils/src';
import { RemoteDevError } from '../packages/protocol/src';

export function runSecurityTests(): boolean {
  console.log('\n=== [SUITE] Security & Path Traversal Tests ===');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  };

  const dummyRoot = path.resolve(process.cwd(), 'sample_workspace');

  // 1. Safe path validation
  const safeInside = resolveSafeWorkspacePath(dummyRoot, 'src/App.tsx');
  assert(safeInside.startsWith(dummyRoot), 'Safe path stays within workspace root');

  // 2. Traversal ../ rejection
  let caughtTraversal = false;
  try {
    resolveSafeWorkspacePath(dummyRoot, '../escape.txt');
  } catch (err: any) {
    if (err && (err.code === 'PATH_TRAVERSAL_DENIED' || err.message?.includes('escapes approved workspace'))) {
      caughtTraversal = true;
    }
  }
  assert(caughtTraversal, 'Rejects ../ directory traversal with PATH_TRAVERSAL_DENIED');

  // 3. Nested traversal rejection
  let caughtNested = false;
  try {
    resolveSafeWorkspacePath(dummyRoot, 'sub/../../escape.txt');
  } catch (err: any) {
    if (err && (err.code === 'PATH_TRAVERSAL_DENIED' || err.message?.includes('escapes approved workspace'))) {
      caughtNested = true;
    }
  }
  assert(caughtNested, 'Rejects nested sub/../../ traversal');

  // 4. Null byte rejection
  let caughtNull = false;
  try {
    resolveSafeWorkspacePath(dummyRoot, 'src/file.txt\0.exe');
  } catch (err: any) {
    if (err && (err.code === 'PATH_TRAVERSAL_DENIED' || err.message?.includes('Null byte'))) {
      caughtNull = true;
    }
  }
  assert(caughtNull, 'Rejects null-byte injection');

  // 5. Exclusions
  assert(isPathExcluded('.git/config'), '.git directory is excluded');
  assert(isPathExcluded('node_modules/express/index.js'), 'node_modules directory is excluded');
  assert(isPathExcluded('.env'), '.env file is excluded');
  assert(!isPathExcluded('src/components/Button.tsx'), 'Source files are not excluded');

  // 6. Secret Redaction
  const dirtyData = {
    username: 'developer',
    password: 'secret_password_123',
    token: 'jwt.token.abcxyz',
    nested: {
      apiKey: 'sk-1234567890',
      normalField: 'ok',
    },
  };
  const cleanData: any = sanitizeLogData(dirtyData);
  assert(cleanData.password === '[REDACTED]', 'Password redacted from logs');
  assert(cleanData.token === '[REDACTED]', 'Token redacted from logs');
  assert(cleanData.nested.apiKey === '[REDACTED]', 'Nested API key redacted from logs');
  assert(cleanData.nested.normalField === 'ok', 'Non-sensitive field preserved');

  console.log(`Security Tests Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}
