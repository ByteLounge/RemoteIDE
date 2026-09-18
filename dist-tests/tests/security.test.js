"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSecurityTests = runSecurityTests;
const path_1 = __importDefault(require("path"));
const src_1 = require("../packages/shared-utils/src");
const src_2 = require("../packages/protocol/src");
function runSecurityTests() {
    console.log('\n=== [SUITE] Security & Path Traversal Tests ===');
    let passed = 0;
    let failed = 0;
    const assert = (condition, msg) => {
        if (condition) {
            console.log(`  ✓ ${msg}`);
            passed++;
        }
        else {
            console.error(`  ✗ FAIL: ${msg}`);
            failed++;
        }
    };
    const dummyRoot = path_1.default.resolve(process.cwd(), 'sample_workspace');
    // 1. Safe path validation
    const safeInside = (0, src_1.resolveSafeWorkspacePath)(dummyRoot, 'src/App.tsx');
    assert(safeInside.startsWith(dummyRoot), 'Safe path stays within workspace root');
    // 2. Traversal ../ rejection
    let caughtTraversal = false;
    try {
        (0, src_1.resolveSafeWorkspacePath)(dummyRoot, '../escape.txt');
    }
    catch (err) {
        if (err instanceof src_2.RemoteDevError && err.code === 'PATH_TRAVERSAL_DENIED') {
            caughtTraversal = true;
        }
    }
    assert(caughtTraversal, 'Rejects ../ directory traversal with PATH_TRAVERSAL_DENIED');
    // 3. Nested traversal rejection
    let caughtNested = false;
    try {
        (0, src_1.resolveSafeWorkspacePath)(dummyRoot, 'sub/../../escape.txt');
    }
    catch (err) {
        if (err instanceof src_2.RemoteDevError && err.code === 'PATH_TRAVERSAL_DENIED') {
            caughtNested = true;
        }
    }
    assert(caughtNested, 'Rejects nested sub/../../ traversal');
    // 4. Null byte rejection
    let caughtNull = false;
    try {
        (0, src_1.resolveSafeWorkspacePath)(dummyRoot, 'src/file.txt\0.exe');
    }
    catch (err) {
        if (err instanceof src_2.RemoteDevError && err.code === 'PATH_TRAVERSAL_DENIED') {
            caughtNull = true;
        }
    }
    assert(caughtNull, 'Rejects null-byte injection');
    // 5. Exclusions
    assert((0, src_1.isPathExcluded)('.git/config'), '.git directory is excluded');
    assert((0, src_1.isPathExcluded)('node_modules/express/index.js'), 'node_modules directory is excluded');
    assert((0, src_1.isPathExcluded)('.env'), '.env file is excluded');
    assert(!(0, src_1.isPathExcluded)('src/components/Button.tsx'), 'Source files are not excluded');
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
    const cleanData = (0, src_1.sanitizeLogData)(dirtyData);
    assert(cleanData.password === '[REDACTED]', 'Password redacted from logs');
    assert(cleanData.token === '[REDACTED]', 'Token redacted from logs');
    assert(cleanData.nested.apiKey === '[REDACTED]', 'Nested API key redacted from logs');
    assert(cleanData.nested.normalField === 'ok', 'Non-sensitive field preserved');
    console.log(`Security Tests Result: ${passed} passed, ${failed} failed`);
    return failed === 0;
}
