import { runSecurityTests } from './security.test';
import { runSyncTests } from './sync.test';
import { runIntegrationTests } from './integration.test';

async function main() {
  console.log('====================================================');
  console.log('         RemoteDev Automated Verification Suite     ');
  console.log('====================================================');

  const secOk = runSecurityTests();
  const syncOk = runSyncTests();
  const intOk = await runIntegrationTests();

  console.log('\n====================================================');
  if (secOk && syncOk && intOk) {
    console.log('  ALL TEST SUITES PASSED SUCCESSFULLY! (100%)');
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error('  SOME TEST SUITES FAILED!');
    console.log('====================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
