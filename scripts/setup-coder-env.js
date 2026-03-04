#!/usr/bin/env node
/**
 * Pre-creates the Coder agent's Python venv with ruff and standard libs.
 * Run once before using the Coder agent to avoid slow first-run setup.
 * Requires: python3, pip
 */
const { getRuffPath } = require('../api/server/services/LocalCodeExecution/executor');

(async () => {
  console.log('Setting up Coder agent environment (Python venv + ruff + standard libs)...');
  try {
    const ruffPath = await getRuffPath();
    if (ruffPath) {
      console.log('Done. Ruff available at:', ruffPath);
    } else {
      console.log('Venv setup skipped (LIBRECHAT_CODE_VENV_DIR="" or python3 unavailable).');
    }
  } catch (e) {
    console.error('Setup failed:', e?.message || e);
    process.exit(1);
  }
})();
