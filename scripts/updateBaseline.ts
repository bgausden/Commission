#!/usr/bin/env node
/**
 * Update an existing baseline with new commission calculation outputs
 * 
 * Usage:
 *   npm run update-baseline -- <baseline-name>
 *   npx tsx scripts/updateBaseline.ts my-baseline
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdir, writeFile } from 'fs/promises';
import type { BaselineMetadata } from '../src/regression.types.js';
import { readJSON, writeJSON, ensureDir, fileExists } from './utils/fileUtils.js';
import { getCommitSHA, getShortCommitSHA } from './utils/gitUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

async function updateBaseline(baselineName: string): Promise<void> {
  console.log(`Updating baseline: ${baselineName}`);
  console.log('='.repeat(60));
  
  const baselineDir = join(PROJECT_ROOT, 'test-baselines', baselineName);
  const metadataPath = join(baselineDir, 'metadata.json');
  
  // Step 1: Verify baseline exists
  if (!await fileExists(metadataPath)) {
    throw new Error(`Baseline "${baselineName}" does not exist. Run: npm run create-baseline -- ${baselineName}`);
  }
  
  console.log(`Baseline directory: ${baselineDir}`);
  
  // Step 2: Load existing metadata
  const metadata = await readJSON<BaselineMetadata>(metadataPath);
  console.log(`Original baseline created: ${metadata.createdDate}`);
  console.log(`Original commit: ${metadata.commitSHA.substring(0, 7)}`);
  console.log(`Source file: ${metadata.sourceFile}`);
  
  // Step 3: Setup output directory
  const outputsDir = join(baselineDir, 'outputs');
  await ensureDir(outputsDir);
  
  console.log('\nRunning commission calculation...');
  console.log('-'.repeat(60));
  
  // Step 4: Run commission calculation
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  const env = {
    ...process.env,
    PAYMENTS_DIR: outputsDir,
    LOGS_DIR: outputsDir,
    DATA_DIR: join(PROJECT_ROOT, 'data'),
    LOG4JS_CONSOLE: 'errors',
  };
  
  try {
    // First, remove old output files
    const oldFiles = await readdir(outputsDir);
    const { unlink } = await import('fs/promises');
    for (const file of oldFiles) {
      if (file !== 'README.md' && file !== '.gitkeep') {
        await unlink(join(outputsDir, file));
      }
    }
    
    const { stdout, stderr } = await execAsync('npm run run:tsx', {
      cwd: PROJECT_ROOT,
      env,
    });
    
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
  } catch (error: any) {
    console.error('Commission calculation failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw new Error('Commission calculation failed');
  }
  
  console.log('-'.repeat(60));
  console.log('Commission calculation complete\n');
  
  // Step 5: Verify new outputs exist
  console.log('Verifying new outputs...');
  const outputFiles = await readdir(outputsDir);
  
  const paymentsFile = outputFiles.find(f => f.includes('Talenox Payments'));
  const commissionLog = outputFiles.find(f => f.startsWith('commission-'));
  const contractorLog = outputFiles.find(f => f.startsWith('contractor-'));
  
  if (!paymentsFile) {
    throw new Error('Payments Excel file not generated');
  }
  if (!commissionLog) {
    throw new Error('Commission log not generated');
  }
  
  console.log(`  ✓ Payments: ${paymentsFile}`);
  console.log(`  ✓ Commission log: ${commissionLog}`);
  if (contractorLog) {
    console.log(`  ✓ Contractor log: ${contractorLog}`);
  }
  
  // Step 6: Update metadata
  console.log('\nUpdating metadata...');
  const currentSHA = await getCommitSHA();
  const shortSHA = await getShortCommitSHA();
  
  const updatedMetadata: BaselineMetadata = {
    ...metadata,
    commitSHA: currentSHA,
    createdDate: new Date().toISOString(),
  };
  
  await writeJSON(metadataPath, updatedMetadata);
  
  // Step 7: Update README
  const readme = `# Baseline: ${baselineName}

## Summary
- **Created**: ${metadata.createdDate}
- **Updated**: ${new Date().toISOString()}
- **Original Commit**: ${metadata.commitSHA.substring(0, 7)}
- **Current Commit**: ${shortSHA} (${currentSHA})
- **Source**: ${metadata.sourceFile}
- **Payroll Period**: ${metadata.payrollMonth}/${metadata.payrollYear}
- **Staff Count**: ${metadata.staffCount}

## Description
${metadata.description || `Regression test baseline for ${metadata.payrollMonth}/${metadata.payrollYear} payroll period.`}

## Files
- \`metadata.json\` - Baseline metadata and checksums
- \`source/${metadata.sourceFile}\` - Original Mindbody payroll report
- \`config/staffHurdle.json\` - Commission configuration snapshot
- \`config/default.json\` - Runtime configuration snapshot
- \`outputs/${paymentsFile}\` - Generated Talenox payments
- \`outputs/${commissionLog}\` - Commission calculation log
${contractorLog ? `- \`outputs/${contractorLog}\` - Contractor payments log` : ''}

## Usage
\`\`\`bash
# Run regression test against this baseline
npm run test:regression -- ${baselineName}

# Update this baseline with current results
npm run update-baseline -- ${baselineName}
\`\`\`

## Staff IDs
${metadata.staffIds.join(', ')}

## Update History
- **Original**: ${metadata.createdDate} (commit ${metadata.commitSHA.substring(0, 7)})
- **Updated**: ${new Date().toISOString()} (commit ${shortSHA})
`;
  
  await writeFile(join(baselineDir, 'README.md'), readme, 'utf-8');
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Baseline updated successfully: ${baselineName}`);
  console.log(`   Previous commit: ${metadata.commitSHA.substring(0, 7)}`);
  console.log(`   Current commit:  ${shortSHA}`);
  console.log('='.repeat(60));
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: npx tsx scripts/updateBaseline.ts <baseline-name>');
    console.error('');
    console.error('Example:');
    console.error('  npx tsx scripts/updateBaseline.ts dec-2025-baseline');
    process.exit(1);
  }
  
  const baselineName = args[0];
  
  updateBaseline(baselineName)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}

export { updateBaseline };
