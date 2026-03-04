/**
 * Ensures workspace has .venv and installs requirements.txt.
 * Used after template clone and by install_dependencies tool.
 */
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const { logger } = require('@librechat/data-schemas');

const execFileAsync = promisify(execFile);
const PIP_INSTALL_TIMEOUT = 120000;

/**
 * @param {string} workspaceRoot - Absolute workspace path
 * @returns {Promise<{ success: boolean; message: string; stderr?: string }>}
 */
async function ensureWorkspaceVenv(workspaceRoot) {
  const reqPath = path.join(workspaceRoot, 'requirements.txt');
  try {
    await fs.access(reqPath);
  } catch {
    return { success: false, message: 'No requirements.txt in workspace.' };
  }

  const venvDir = path.join(workspaceRoot, '.venv');
  const binDir = path.join(venvDir, process.platform === 'win32' ? 'Scripts' : 'bin');
  const pipPath = path.join(binDir, process.platform === 'win32' ? 'pip.exe' : 'pip');

  try {
    const venvExists = await fs.access(venvDir).then(() => true).catch(() => false);
    if (!venvExists) {
      await execFileAsync('python3', ['-m', 'venv', venvDir], {
        cwd: workspaceRoot,
        timeout: 60000,
      });
    }
    await execFileAsync(pipPath, ['install', '--quiet', '-r', 'requirements.txt'], {
      cwd: workspaceRoot,
      timeout: PIP_INSTALL_TIMEOUT,
    });
    return { success: true, message: 'Dependencies installed.' };
  } catch (err) {
    const stderr = err.stderr || err.stdout || err.message || '';
    logger.warn('[WorkspaceVenv] install failed:', stderr);
    return {
      success: false,
      message: `Failed to install dependencies: ${err.message || 'Unknown error'}`,
      stderr: stderr.slice(0, 500),
    };
  }
}

module.exports = { ensureWorkspaceVenv };
