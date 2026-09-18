"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const security_test_1 = require("./security.test");
const sync_test_1 = require("./sync.test");
const integration_test_1 = require("./integration.test");
async function main() {
    console.log('====================================================');
    console.log('         RemoteDev Automated Verification Suite     ');
    console.log('====================================================');
    const secOk = (0, security_test_1.runSecurityTests)();
    const syncOk = (0, sync_test_1.runSyncTests)();
    const intOk = await (0, integration_test_1.runIntegrationTests)();
    console.log('\n====================================================');
    if (secOk && syncOk && intOk) {
        console.log('  ALL TEST SUITES PASSED SUCCESSFULLY! (100%)');
        console.log('====================================================');
        process.exit(0);
    }
    else {
        console.error('  SOME TEST SUITES FAILED!');
        console.log('====================================================');
        process.exit(1);
    }
}
main().catch((err) => {
    console.error('Test execution failed with error:', err);
    process.exit(1);
});
