#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-python.js <script.py> [...args]');
  process.exit(1);
}

const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
const result = spawnSync(pythonBin, args, { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
