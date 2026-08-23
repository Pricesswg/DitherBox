#!/usr/bin/env node
import { run } from '../src/cli/main.js';

try {
  process.exitCode = await run();
} catch (err) {
  process.stderr.write(`ditherbox: ${err.message}\n`);
  process.exitCode = 1;
}
