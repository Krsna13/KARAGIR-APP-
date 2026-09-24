#!/usr/bin/env node

/**
 * scripts/build-android.js
 *
 * Cross-platform Android build script for Karagir.
 *
 * Usage:
 *   node scripts/build-android.js
 *   node scripts/build-android.js --enable-dev-tools
 *   VITE_ENABLE_DEV_TOOLS=true node scripts/build-android.js
 *
 * Behavior:
 *   1. Parses VITE_ENABLE_DEV_TOOLS from CLI arguments or environment.
 *   2. Compiles TypeScript and builds the web bundle (Vite) with the flag set.
 *   3. Synchronizes the built output with Capacitor Android (npx cap sync android).
 */

import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const enableDevToolsArg = args.includes('--enable-dev-tools') || args.some((arg) => arg.startsWith('--dev-tools'));
const envFlag = process.env.VITE_ENABLE_DEV_TOOLS;

// True if explicitly set via --enable-dev-tools or VITE_ENABLE_DEV_TOOLS=true/1
const isDevToolsEnabled = enableDevToolsArg || envFlag === 'true' || envFlag === '1';

console.log('----------------------------------------------------');
console.log(`[build:android] Target: Android (Capacitor)`);
console.log(`[build:android] VITE_ENABLE_DEV_TOOLS = ${isDevToolsEnabled ? 'true (TESTING BUILD)' : 'false (PRODUCTION BUILD)'}`);
console.log('----------------------------------------------------');

const buildEnv = {
  ...process.env,
  VITE_ENABLE_DEV_TOOLS: isDevToolsEnabled ? 'true' : 'false',
};

// 1. Build Web Assets
console.log('[build:android] Step 1/2: Compiling TypeScript & building web bundle...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const buildResult = spawnSync(`${npmCmd} run build`, {
  stdio: 'inherit',
  env: buildEnv,
  shell: true,
});

if (buildResult.status !== 0) {
  console.error(`\n[build:android] Web build failed with exit code ${buildResult.status}`);
  process.exit(buildResult.status || 1);
}

// 2. Sync with Capacitor Android
console.log('\n[build:android] Step 2/2: Syncing web assets with Capacitor Android...');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const syncResult = spawnSync(`${npxCmd} cap sync android`, {
  stdio: 'inherit',
  env: buildEnv,
  shell: true,
});

if (syncResult.status !== 0) {
  console.error(`\n[build:android] Capacitor sync failed with exit code ${syncResult.status}`);
  process.exit(syncResult.status || 1);
}

console.log('\n====================================================');
console.log(`[build:android] Android build & sync completed successfully!`);
console.log(`Dev routes (/dev/device-check, /dev/voice-input) ${isDevToolsEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log('====================================================');
