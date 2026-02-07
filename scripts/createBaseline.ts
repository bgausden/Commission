#!/usr/bin/env node
/**
 * Create baseline for regression testing
 * 
 * Usage:
 *   npm run create-baseline -- <baseline-name> [commit-sha]
 *   npx tsx scripts/createBaseline.ts dec-2025-baseline
 *   npx tsx scripts/createBaseline.ts dec-2025-baseline abc123
 */

import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { readFile, readdir, writeFile } from 'fs/promises';
import type { BaselineMetadata } from '../src/regression.types.js';
import {
  copyFile,
  ensureDir,
  writeJSON,
  computeChecksum,
  fileExists,
} from './utils/fileUtils.js';
import {
  getCurrentBranch,
  getCommitSHA,
  getShortCommitSHA,
  stashPush,
  stashPop,
  checkout,
  isWorkingTreeClean,
} from './utils/gitUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

interface CreateBaselineOptions {
  baselineName: string;
  commitSHA?: string;
  description?: string;
}

async function createBaseline(options: CreateBaselineOptions): Promise<void> {
  const { baselineName, commitSHA, description } = options;
  
  console.log(`Creating baseline: ${baselineName}`);
  console.log('='.repeat(60));
  
  // Step 1: Save current git state
  let originalBranch: string | undefined;
  let stashRef: string | undefined;
  let needsRestore = false;
  
  try {
    originalBranch = await getCurrentBranch();
    console.log(`Current branch: ${originalBranch}`);
    
    if (commitSHA) {
      console.log(`Target commit: ${commitSHA}`);
      
      const isClean = await isWorkingTreeClean();
      if (!isClean) {
        console.log('Stashing uncommitted changes...');
        stashRef = await stashPush(`Baseline creation for ${baselineName}`);
        needsRestore = true;
      }
      
      console.log(`Checking out ${commitSHA}...`);
      await checkout(commitSHA);
      needsRestore = true;
    }
    
    // Step 2: Get commit information
    const currentSHA = await getCommitSHA();
    const shortSHA = await getShortCommitSHA();
    console.log(`Using commit: ${shortSHA}`);
    
    // Step 3: Load config to get source file name
    // Import config dynamically after potential checkout
    const configPath = join(PROJECT_ROOT, 'config', 'default.json');
    const configContent = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent) as { PAYROLL_WB_FILENAME: string };
    const sourceFileName = config.PAYROLL_WB_FILENAME;
    
    console.log(`Source file: ${sourceFileName}`);
    
    // Step 4: Parse source filename for payroll month/year
    const { PAYROLL_MONTH, PAYROLL_YEAR } = parseFilename(sourceFileName);
    
    // Step 5: Setup baseline directory structure
    const baselineDir = join(PROJECT_ROOT, 'test-baselines', baselineName);
    await ensureDir(baselineDir);
    await ensureDir(join(baselineDir, 'source'));
    await ensureDir(join(baselineDir, 'config'));
    await ensureDir(join(baselineDir, 'outputs'));
    
    console.log(`Baseline directory: ${relative(PROJECT_ROOT, baselineDir)}`);
    
    // Step 6: Copy source Excel file
    const sourceFilePath = join(PROJECT_ROOT, 'data', sourceFileName);
    if (!await fileExists(sourceFilePath)) {
      throw new Error(`Source file not found: ${sourceFilePath}`);
    }
    
    console.log('Copying source file...');
    await copyFile(sourceFilePath, join(baselineDir, 'source', sourceFileName));
    const sourceChecksum = await computeChecksum(sourceFilePath);
    
    // Step 7: Copy config files
    console.log('Copying configuration files...');
    const staffHurdlePath = join(PROJECT_ROOT, 'config', 'staffHurdle.json');
    await copyFile(staffHurdlePath, join(baselineDir, 'config', 'staffHurdle.json'));
    const staffHurdleChecksum = await computeChecksum(staffHurdlePath);
    
    await copyFile(configPath, join(baselineDir, 'config', 'default.json'));
    const defaultConfigChecksum = await computeChecksum(configPath);
    
    // Step 8: Extract staff IDs from staffHurdle.json
    const staffHurdleContent = await readFile(staffHurdlePath, 'utf-8');
    const staffHurdle = JSON.parse(staffHurdleContent);
    const staffIds = Object.keys(staffHurdle)
      .filter(id => id !== '000') // Exclude default
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    console.log(`Staff count: ${staffIds.length}`);
    
    // Step 9: Run commission calculation
    console.log('\nRunning commission calculation...');
    console.log('-'.repeat(60));
    
    // Set temp output directories
    const tempPaymentsDir = join(baselineDir, 'outputs');
    const tempLogsDir = join(baselineDir, 'outputs');
    
    // Run commission as subprocess to avoid import/state issues
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const env = {
      ...process.env,
      PAYMENTS_DIR: tempPaymentsDir,
      LOGS_DIR: tempLogsDir,
      DATA_DIR: join(PROJECT_ROOT, 'data'),
      LOG4JS_CONSOLE: 'errors', // Only show errors in console
    };
    
    try {
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
    
    // Step 10: Verify outputs exist
    console.log('Verifying outputs...');
    const outputFiles = await readdir(join(baselineDir, 'outputs'));
    
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
    
    // Step 11: Create metadata
    console.log('\nCreating metadata...');
    const metadata: BaselineMetadata = {
      baselineName,
      commitSHA: currentSHA,
      createdDate: new Date().toISOString(),
      sourceFile: sourceFileName,
      sourceFileChecksum: sourceChecksum,
      payrollMonth: PAYROLL_MONTH,
      payrollYear: PAYROLL_YEAR,
      configChecksums: {
        staffHurdle: staffHurdleChecksum,
        default: defaultConfigChecksum,
      },
      staffCount: staffIds.length,
      staffIds,
      description: description || `Baseline for ${PAYROLL_MONTH}/${PAYROLL_YEAR} payroll`,
    };
    
    await writeJSON(join(baselineDir, 'metadata.json'), metadata);
    
    // Step 12: Create README
    const readme = `# Baseline: ${baselineName}

## Summary
- **Created**: ${new Date().toISOString()}
- **Commit**: ${shortSHA} (${currentSHA})
- **Source**: ${sourceFileName}
- **Payroll Period**: ${PAYROLL_MONTH}/${PAYROLL_YEAR}
- **Staff Count**: ${staffIds.length}

## Description
${description || `Regression test baseline for ${PAYROLL_MONTH}/${PAYROLL_YEAR} payroll period.`}

## Files
- \`metadata.json\` - Baseline metadata and checksums
- \`source/${sourceFileName}\` - Original Mindbody payroll report
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
${staffIds.join(', ')}
`;
    
    await writeFile(join(baselineDir, 'README.md'), readme, 'utf-8');
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Baseline created successfully: ${baselineName}`);
    console.log(`   Location: ${relative(PROJECT_ROOT, baselineDir)}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error creating baseline:', error);
    throw error;
  } finally {
    // Step 13: Restore git state
    if (needsRestore) {
      console.log('\nRestoring git state...');
      if (originalBranch) {
        await checkout(originalBranch);
        console.log(`  ✓ Returned to branch: ${originalBranch}`);
      }
      if (stashRef) {
        await stashPop();
        console.log(`  ✓ Restored stashed changes`);
      }
    }
  }
}

/**
 * Simple filename parser (inline to avoid import issues)
 */
function parseFilename(filename: string): { PAYROLL_MONTH: number; PAYROLL_YEAR: number } {
  const match = filename.match(/(\d+)-\d+-(\d{4})/);
  if (!match) {
    throw new Error(`Cannot parse payroll month/year from filename: ${filename}`);
  }
  return {
    PAYROLL_MONTH: parseInt(match[1]),
    PAYROLL_YEAR: parseInt(match[2]),
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: npx tsx scripts/createBaseline.ts <baseline-name> [commit-sha]');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/createBaseline.ts dec-2025-baseline');
    console.error('  npx tsx scripts/createBaseline.ts dec-2025-baseline abc123');
    process.exit(1);
  }
  
  const baselineName = args[0];
  const commitSHA = args[1];
  
  createBaseline({ baselineName, commitSHA })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { createBaseline };
