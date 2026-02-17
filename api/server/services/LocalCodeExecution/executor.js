/**
 * Local code execution via child_process. No external API or key required.
 * Returns same format as remote Code API for processLocalCodeOutput compatibility.
 *
 * Session dirs persist across runs so files from previous executions are available.
 * TODO: Add cleanup job to delete session dirs in SESSION_BASE_DIR older than
 * LOCAL_CODE_SESSION_MAX_AGE_HOURS (e.g. 24). Cron or startup sweep.
 */
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');

const imageExtRegex = /\.(jpg|jpeg|png|gif|webp)$/i;
const EXEC_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 512 * 1024;

const SESSION_BASE_DIR =
  process.env.LIBRECHAT_CODE_SESSIONS_DIR ?? path.join(os.tmpdir(), 'librechat_code_sessions');

const CODE_EXEC_VENV_DIR =
  process.env.LIBRECHAT_CODE_VENV_DIR ?? path.join(path.dirname(SESSION_BASE_DIR), 'librechat_code_venv');

const REQUIREMENTS_PATH = path.join(__dirname, 'requirements.txt');

let _venvReady = false;

function getSessionBaseDir() {
  return SESSION_BASE_DIR;
}

/**
 * Ensures the code execution venv exists with standard libs installed.
 * Skips if LIBRECHAT_CODE_VENV_DIR is set to empty or if python3 -m venv is unavailable.
 */
async function ensureCodeExecVenv() {
  if (process.env.LIBRECHAT_CODE_VENV_DIR === '') {
    return null;
  }
  if (_venvReady) {
    return path.join(CODE_EXEC_VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin', 'python');
  }
  try {
    await fs.mkdir(CODE_EXEC_VENV_DIR, { recursive: true });
    const markerPath = path.join(CODE_EXEC_VENV_DIR, '.librechat-venv-ready');
    try {
      await fs.access(markerPath);
      _venvReady = true;
      return path.join(CODE_EXEC_VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin', 'python');
    } catch {
      /* venv not ready yet */
    }
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const exec = promisify(execFile);
    const pip = path.join(CODE_EXEC_VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin', 'pip');
    await exec('python3', ['-m', 'venv', CODE_EXEC_VENV_DIR], { timeout: 60000 });
    await exec(pip, ['install', '--quiet', '-r', REQUIREMENTS_PATH], { timeout: 120000 });
    await fs.writeFile(markerPath, 'ok', 'utf8');
    _venvReady = true;
    logger.info('[LocalCodeExecution] Venv ready with standard libs at', CODE_EXEC_VENV_DIR);
    return path.join(CODE_EXEC_VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin', 'python');
  } catch (e) {
    logger.warn('[LocalCodeExecution] Could not setup venv, falling back to system python3:', e?.message);
    return null;
  }
}

/**
 * Copies agent-uploaded files into the workspace dir so Python can read them via /mnt/data paths.
 * Resolves virtual filepaths (e.g. /uploads/user/file) and supports cloud storage via streaming.
 * @param {string} workspaceDir - Session directory (workspace root; /mnt/data maps here)
 * @param {Array<{ filepath?: string; filename: string; source?: string }>} agentFiles - Files to copy
 * @param {import('express').Request} [req] - Request object for resolving paths and streaming (required for non-local or virtual paths)
 */
async function injectAgentFiles(workspaceDir, agentFiles, req) {
  if (!agentFiles?.length) {
    return;
  }
  await fs.mkdir(workspaceDir, { recursive: true });
  const { pipeline } = require('stream').promises;
  const { createWriteStream } = require('fs');
  const { getStrategyFunctions } = require('~/server/services/Files/strategies');
  const { FileSources } = require('librechat-data-provider');

  for (const f of agentFiles) {
    if (!f.filename || !f.filepath) {
      logger.debug('[LocalCodeExecution] Skipping agent file (missing filename or filepath):', {
        filename: f?.filename,
        hasFilepath: !!f?.filepath,
      });
      continue;
    }
    const dest = path.join(workspaceDir, path.basename(f.filename));
    try {
      if (req) {
        const source = f.source ?? FileSources.local;
        const { getDownloadStream } = getStrategyFunctions(source);
        if (getDownloadStream) {
          const readStream = await getDownloadStream(req, f.filepath);
          const writeStream = createWriteStream(dest);
          await pipeline(readStream, writeStream);
          continue;
        }
      }
      logger.warn('[LocalCodeExecution] Cannot copy agent file (missing req or unsupported source):', f.filename);
    } catch (e) {
      logger.warn('[LocalCodeExecution] Failed to copy agent file:', f.filename, e?.message);
    }
  }
}

/**
 * @param {object} params
 * @param {string} params.lang - py (Python only)
 * @param {string} params.code
 * @param {string[]} [params.args]
 * @param {string} [params.session_id] - Reuse this session's workspace for file persistence
 * @param {(params: { source: 'stdout'|'stderr'; chunk: string }) => void} [params.onOutput] - Called for each stdout/stderr chunk for streaming
 * @returns {Promise<{ stdout: string; stderr: string; session_id: string; files: Array<{ name: string; buffer: Buffer }> }>}
 */
async function runCodeLocally({
  lang,
  code,
  args = [],
  session_id: existingSessionId,
  onOutput,
}) {
  const session_id = existingSessionId ?? `local_${uuidv4().replace(/-/g, '')}`;
  const sessionDir = path.join(SESSION_BASE_DIR, session_id);

  await fs.mkdir(sessionDir, { recursive: true });

  if (lang !== 'py') {
    throw new Error('Local execution supports Python only.');
  }

  const scriptPath = path.join(sessionDir, 'script.py');
  const workspaceDirForward = sessionDir.replace(/\\/g, '/');
  const patchedCode = code
    .replace(/\/mnt\/data\//g, workspaceDirForward + '/')
    .replace(/\/mnt\/data\b/g, workspaceDirForward);
  const wrappedCode = `import os\nos.chdir(${JSON.stringify(sessionDir)})\n${patchedCode}`;
  await fs.writeFile(scriptPath, wrappedCode, 'utf8');

  const pythonPath = (await ensureCodeExecVenv()) ?? 'python3';
  const { stdout, stderr } = await runWithTimeout(pythonPath, [scriptPath, ...args], {
    cwd: sessionDir,
    timeout: EXEC_TIMEOUT_MS,
    onOutput,
  });

  const files = [];
  try {
    const entries = await fs.readdir(sessionDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name !== 'script.py') {
        const fp = path.join(sessionDir, ent.name);
        const buf = await fs.readFile(fp);
        if (buf.length <= 50 * 1024 * 1024) {
          files.push({ name: ent.name, buffer: buf });
        }
      }
    }
  } catch (e) {
    logger.warn('[LocalCodeExecution] Error reading generated files:', e);
  }

  return {
    session_id,
    stdout: truncateOutput(stdout, MAX_OUTPUT_BYTES),
    stderr: truncateOutput(stderr, MAX_OUTPUT_BYTES),
    files,
  };
}

function truncateOutput(str, max) {
  if (Buffer.byteLength(str, 'utf8') <= max) return str;
  return str.slice(0, Math.floor(max / 2)) + '\n[... output truncated ...]\n';
}

function runWithTimeout(cmd, args, opts) {
  const onOutput = opts?.onOutput;
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    const chunks = { out: [], err: [] };
    proc.stdout?.on('data', (c) => {
      chunks.out.push(c);
      if (typeof onOutput === 'function') {
        onOutput({ source: 'stdout', chunk: c.toString('utf8') });
      }
    });
    proc.stderr?.on('data', (c) => {
      chunks.err.push(c);
      if (typeof onOutput === 'function') {
        onOutput({ source: 'stderr', chunk: c.toString('utf8') });
      }
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Execution timed out'));
    }, opts.timeout ?? EXEC_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(chunks.out).toString('utf8');
      const stderr = Buffer.concat(chunks.err).toString('utf8');
      if (code !== 0 && code != null && !signal) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

module.exports = {
  runCodeLocally,
  imageExtRegex,
  getSessionBaseDir,
  injectAgentFiles,
};
